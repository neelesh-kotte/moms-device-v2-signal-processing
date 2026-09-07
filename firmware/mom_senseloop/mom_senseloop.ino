#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <ArduinoJson.h>

// MOM SenseLoop browser-provisioning firmware.
// Built for the website's Connect MOM Device setup wizard.
// This build handles first-time USB provisioning, saved Wi-Fi, and authenticated
// cloud heartbeats. The acoustic acquisition pipeline can share these helpers.

static const char *MOM_PROTOCOL = "mom-provisioning-v1";
static const char *MOM_FIRMWARE_VERSION = "MOM SenseLoop 1.0";
static const unsigned long HEARTBEAT_INTERVAL_MS = 60000UL;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000UL;

Preferences preferences;
String wifiSsid;
String wifiPassword;
String deviceToken;
String cloudEndpoint;
unsigned long lastHeartbeatAt = 0;

void writeJson(const JsonDocument &doc) {
  serializeJson(doc, Serial);
  Serial.println();
}

void emitSimpleStatus(const char *type, const char *status) {
  JsonDocument doc;
  doc["type"] = type;
  doc["status"] = status;
  doc["protocol"] = MOM_PROTOCOL;
  doc["firmware_version"] = MOM_FIRMWARE_VERSION;
  writeJson(doc);
}

void loadSavedConfiguration() {
  preferences.begin("mom", true);
  wifiSsid = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("pass", "");
  deviceToken = preferences.getString("token", "");
  cloudEndpoint = preferences.getString("endpoint", "");
  preferences.end();
}

void saveConfiguration(const String &ssid, const String &password,
                       const String &token, const String &endpoint) {
  preferences.begin("mom", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", password);
  preferences.putString("token", token);
  preferences.putString("endpoint", endpoint);
  preferences.end();

  wifiSsid = ssid;
  wifiPassword = password;
  deviceToken = token;
  cloudEndpoint = endpoint;
}

bool configurationLooksValid() {
  return wifiSsid.length() > 0 && deviceToken.length() >= 24 &&
         cloudEndpoint.startsWith("https://");
}

bool connectWiFi() {
  if (wifiSsid.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.disconnect(false, false);
  delay(100);

  if (wifiPassword.length() > 0) {
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  } else {
    WiFi.begin(wifiSsid.c_str());
  }

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    while (Serial.available()) {
      // Keep the serial buffer from filling while Wi-Fi negotiates.
      Serial.read();
    }
  }
  return WiFi.status() == WL_CONNECTED;
}

bool sendHeartbeat() {
  if (!configurationLooksValid()) return false;
  if (WiFi.status() != WL_CONNECTED && !connectWiFi()) return false;

  WiFiClientSecure client;
  // Prototype transport. HTTPS is used, while production hardware should pin or
  // validate the server certificate chain before shipping beyond research use.
  client.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(12000);
  if (!http.begin(client, cloudEndpoint)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-mom-device-token", deviceToken);

  JsonDocument payload;
  payload["type"] = "heartbeat";
  payload["firmware_version"] = MOM_FIRMWARE_VERSION;
  String body;
  serializeJson(payload, body);

  const int code = http.POST(body);
  const bool ok = code >= 200 && code < 300;
  http.end();

  if (ok) lastHeartbeatAt = millis();
  return ok;
}

void identifyDevice() {
  JsonDocument doc;
  doc["type"] = "mom-device";
  doc["status"] = "ready";
  doc["protocol"] = MOM_PROTOCOL;
  doc["firmware_version"] = MOM_FIRMWARE_VERSION;
  doc["configured"] = configurationLooksValid();
  doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  writeJson(doc);
}

void scanNetworks() {
  JsonDocument doc;
  doc["type"] = "wifi_scan";
  doc["protocol"] = MOM_PROTOCOL;
  JsonArray networks = doc["networks"].to<JsonArray>();

  WiFi.mode(WIFI_STA);
  int count = WiFi.scanNetworks(false, true);
  if (count < 0) count = 0;

  const int limit = min(count, 16);
  for (int i = 0; i < limit; i++) {
    const String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;

    bool duplicate = false;
    for (JsonObject existing : networks) {
      const char *saved = existing["ssid"] | "";
      if (ssid == saved) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;

    JsonObject item = networks.add<JsonObject>();
    item["ssid"] = ssid;
    item["rssi"] = WiFi.RSSI(i);
    item["secure"] = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
  }
  WiFi.scanDelete();
  writeJson(doc);
}

void provisionDevice(JsonDocument &request) {
  const String ssid = request["wifi_ssid"] | "";
  const String password = request["wifi_password"] | "";
  const String token = request["device_token"] | "";
  const String endpoint = request["endpoint"] | "";

  if (ssid.length() == 0 || token.length() < 24 || !endpoint.startsWith("https://")) {
    JsonDocument error;
    error["type"] = "provisioning";
    error["status"] = "error";
    error["message"] = "Missing or invalid provisioning data";
    writeJson(error);
    return;
  }

  saveConfiguration(ssid, password, token, endpoint);
  emitSimpleStatus("provisioning", "saved");

  if (!connectWiFi()) {
    JsonDocument error;
    error["type"] = "provisioning";
    error["status"] = "wifi_error";
    error["message"] = "Could not connect to the selected Wi-Fi network";
    writeJson(error);
    return;
  }

  emitSimpleStatus("provisioning", "wifi_connected");

  if (sendHeartbeat()) {
    emitSimpleStatus("provisioning", "online");
  } else {
    JsonDocument error;
    error["type"] = "provisioning";
    error["status"] = "cloud_error";
    error["message"] = "Wi-Fi connected, but the MOM cloud check-in failed";
    writeJson(error);
  }
}

void handleSerialLine(const String &line) {
  JsonDocument request;
  DeserializationError parseError = deserializeJson(request, line);
  if (parseError) return;

  const String command = request["command"] | "";
  const String protocol = request["protocol"] | "";
  if (protocol.length() > 0 && protocol != MOM_PROTOCOL) return;

  if (command == "identify") {
    identifyDevice();
    return;
  }
  if (command == "scan_wifi") {
    scanNetworks();
    return;
  }
  if (command == "provision") {
    provisionDevice(request);
    return;
  }
  if (command == "heartbeat") {
    emitSimpleStatus("heartbeat", sendHeartbeat() ? "online" : "error");
    return;
  }
}

void serviceSerial() {
  static String line;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') {
      line.trim();
      if (line.length() > 0) handleSerialLine(line);
      line = "";
    } else if (ch != '\r' && line.length() < 4096) {
      line += ch;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  loadSavedConfiguration();
  emitSimpleStatus("boot", "ready");

  if (configurationLooksValid()) {
    if (connectWiFi()) sendHeartbeat();
  }
}

void loop() {
  serviceSerial();

  if (configurationLooksValid() &&
      (lastHeartbeatAt == 0 || millis() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS)) {
    sendHeartbeat();
  }

  delay(5);
}
