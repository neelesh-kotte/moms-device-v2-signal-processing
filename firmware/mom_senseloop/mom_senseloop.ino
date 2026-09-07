#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <math.h>

// MOM SenseLoop browser-provisioning + physical recording firmware.
// Hardware target: ESP32 DevKit + MAX4466 microphone amplifier on GPIO32.

static const char *MOM_PROTOCOL = "mom-provisioning-v1";
static const char *MOM_FIRMWARE_VERSION = "MOM SenseLoop 1.1";
static const unsigned long HEARTBEAT_INTERVAL_MS = 60000UL;
static const unsigned long COMMAND_POLL_INTERVAL_MS = 1500UL;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000UL;
static const int SENSOR_PIN = 32;
static const uint32_t SAMPLE_RATE_HZ = 8000;
static const uint32_t SAMPLE_PERIOD_US = 1000000UL / SAMPLE_RATE_HZ;
static const int WAVEFORM_POINTS = 64;

Preferences preferences;
String wifiSsid;
String wifiPassword;
String deviceToken;
String cloudEndpoint;
unsigned long lastHeartbeatAt = 0;
unsigned long lastCommandPollAt = 0;
bool recordingNow = false;

struct CaptureStats {
  uint32_t sampleCount = 0;
  double mean = 0.0;
  double m2 = 0.0;
  uint16_t minValue = 4095;
  uint16_t maxValue = 0;
  uint32_t clippingCount = 0;
  uint64_t waveformSums[WAVEFORM_POINTS] = {0};
  uint32_t waveformCounts[WAVEFORM_POINTS] = {0};
};

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
  }
  return WiFi.status() == WL_CONNECTED;
}

bool postCloud(JsonDocument &payload, JsonDocument *responseDoc = nullptr) {
  if (!configurationLooksValid()) return false;
  if (WiFi.status() != WL_CONNECTED && !connectWiFi()) return false;

  WiFiClientSecure client;
  // Research prototype transport. HTTPS is used; production hardware should
  // validate/pin the server certificate chain before deployment beyond research use.
  client.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(15000);
  if (!http.begin(client, cloudEndpoint)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-mom-device-token", deviceToken);

  String body;
  serializeJson(payload, body);
  const int code = http.POST(body);
  const String responseText = code > 0 ? http.getString() : "";
  const bool ok = code >= 200 && code < 300;

  if (responseDoc && responseText.length() > 0) {
    deserializeJson(*responseDoc, responseText);
  }

  http.end();
  if (ok) lastHeartbeatAt = millis();
  return ok;
}

bool sendHeartbeat() {
  JsonDocument payload;
  payload["type"] = "heartbeat";
  payload["firmware_version"] = MOM_FIRMWARE_VERSION;
  return postCloud(payload);
}

void reportCommandFailure(const String &commandId, const String &message) {
  if (commandId.length() == 0) return;
  JsonDocument payload;
  payload["type"] = "command_result";
  payload["firmware_version"] = MOM_FIRMWARE_VERSION;
  payload["command_id"] = commandId;
  payload["status"] = "failed";
  payload["error_message"] = message;
  postCloud(payload);
}

void captureSamples(uint32_t durationSeconds, CaptureStats &stats) {
  const uint32_t targetSamples = durationSeconds * SAMPLE_RATE_HZ;
  uint32_t nextSampleAt = micros();

  for (uint32_t i = 0; i < targetSamples; i++) {
    while ((int32_t)(micros() - nextSampleAt) < 0) {
      // Short timing wait keeps sample spacing near the requested 8 kHz rate.
    }
    nextSampleAt += SAMPLE_PERIOD_US;

    const uint16_t value = (uint16_t)analogRead(SENSOR_PIN);
    stats.sampleCount++;

    const double delta = (double)value - stats.mean;
    stats.mean += delta / (double)stats.sampleCount;
    const double delta2 = (double)value - stats.mean;
    stats.m2 += delta * delta2;

    if (value < stats.minValue) stats.minValue = value;
    if (value > stats.maxValue) stats.maxValue = value;
    if (value <= 8 || value >= 4087) stats.clippingCount++;

    int bin = (int)(((uint64_t)i * WAVEFORM_POINTS) / targetSamples);
    if (bin >= WAVEFORM_POINTS) bin = WAVEFORM_POINTS - 1;
    stats.waveformSums[bin] += value;
    stats.waveformCounts[bin]++;
  }
}

String qualityLabelFor(const CaptureStats &stats, uint32_t expectedSamples) {
  if (stats.sampleCount < expectedSamples * 9 / 10) return "incomplete";
  const double variance = stats.sampleCount > 1 ? stats.m2 / (double)(stats.sampleCount - 1) : 0.0;
  const double stddev = sqrt(max(variance, 0.0));
  const double clippingFraction = stats.sampleCount ? (double)stats.clippingCount / (double)stats.sampleCount : 1.0;

  if (clippingFraction > 0.01 || stddev < 3.0) return "poor";
  if (clippingFraction > 0.002 || stddev < 8.0) return "fair";
  return "good";
}

bool uploadRecordedSession(const String &commandId, uint32_t durationSeconds,
                           const CaptureStats &stats) {
  const uint32_t expectedSamples = durationSeconds * SAMPLE_RATE_HZ;
  const double variance = stats.sampleCount > 1 ? stats.m2 / (double)(stats.sampleCount - 1) : 0.0;
  const double stddev = sqrt(max(variance, 0.0));
  const double clippingFraction = stats.sampleCount ? (double)stats.clippingCount / (double)stats.sampleCount : 0.0;
  const uint16_t peakToPeak = stats.maxValue >= stats.minValue ? stats.maxValue - stats.minValue : 0;
  const String quality = qualityLabelFor(stats, expectedSamples);

  JsonDocument payload;
  payload["type"] = "session";
  payload["firmware_version"] = MOM_FIRMWARE_VERSION;
  payload["command_id"] = commandId;
  payload["duration_seconds"] = durationSeconds;
  payload["quality_label"] = quality;
  payload["learning_eligible"] = quality == "good" || quality == "fair";

  JsonObject qualitySummary = payload["quality_summary"].to<JsonObject>();
  qualitySummary["contactConsistency"] = stddev >= 8.0 ? "Signal present" : "Low signal level";
  qualitySummary["backgroundNoise"] = "Not independently measured";
  qualitySummary["motionStability"] = "Not independently measured";
  qualitySummary["clipping"] = clippingFraction > 0.002;
  qualitySummary["completion"] = stats.sampleCount >= expectedSamples * 9 / 10 ? "Completed" : "Incomplete";
  if (quality == "good") {
    qualitySummary["guidance"] = "The physical device completed the recording with usable engineering signal-quality checks.";
  } else if (quality == "fair") {
    qualitySummary["guidance"] = "The physical recording was received, but one or more engineering quality checks should be reviewed.";
  } else if (quality == "poor") {
    qualitySummary["guidance"] = "The physical recording was received, but clipping or very low signal amplitude limits interpretation.";
  } else {
    qualitySummary["guidance"] = "The requested physical recording did not complete fully.";
  }

  JsonObject acousticSummary = payload["acoustic_summary"].to<JsonObject>();
  acousticSummary["source"] = "ESP32 + MAX4466 physical capture";
  acousticSummary["sample_rate_hz"] = SAMPLE_RATE_HZ;
  acousticSummary["sample_count"] = stats.sampleCount;
  acousticSummary["adc_mean"] = stats.mean;
  acousticSummary["adc_stddev"] = stddev;
  acousticSummary["peak_to_peak_adc"] = peakToPeak;
  acousticSummary["clipping_fraction"] = clippingFraction;
  acousticSummary["interpretation_boundary"] = "Engineering signal summary only; not a diagnostic or objective hunger measurement.";

  JsonArray waveform = acousticSummary["waveform"].to<JsonArray>();
  for (int i = 0; i < WAVEFORM_POINTS; i++) {
    double point = 0.0;
    if (stats.waveformCounts[i] > 0) {
      const double average = (double)stats.waveformSums[i] / (double)stats.waveformCounts[i];
      point = (average - stats.mean) / 2048.0;
    }
    waveform.add(point);
  }

  JsonDocument response;
  return postCloud(payload, &response) && response["ok"] == true;
}

void performRecordingCommand(const String &commandId, uint32_t requestedSeconds) {
  if (recordingNow) return;
  recordingNow = true;

  uint32_t durationSeconds = requestedSeconds;
  if (durationSeconds < 1) durationSeconds = 60;
  if (durationSeconds > 120) durationSeconds = 120;

  emitSimpleStatus("recording", "started");
  CaptureStats stats;
  captureSamples(durationSeconds, stats);
  emitSimpleStatus("recording", "captured");

  if (uploadRecordedSession(commandId, durationSeconds, stats)) {
    emitSimpleStatus("recording", "uploaded");
  } else {
    emitSimpleStatus("recording", "upload_error");
    reportCommandFailure(commandId, "Physical capture completed, but the session upload failed");
  }

  recordingNow = false;
  lastCommandPollAt = millis();
}

void pollForCommands() {
  if (!configurationLooksValid() || recordingNow) return;

  JsonDocument payload;
  payload["type"] = "poll";
  payload["firmware_version"] = MOM_FIRMWARE_VERSION;
  JsonDocument response;
  if (!postCloud(payload, &response)) return;

  JsonVariant commandNode = response["command"];
  if (commandNode.isNull()) return;

  const String commandId = commandNode["id"] | "";
  const String command = commandNode["command"] | "";
  if (command != "record_session" || commandId.length() == 0) return;

  uint32_t durationSeconds = commandNode["payload"]["duration_seconds"] | 60;
  performRecordingCommand(commandId, durationSeconds);
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

  analogReadResolution(12);
  analogSetPinAttenuation(SENSOR_PIN, ADC_11db);

  loadSavedConfiguration();
  emitSimpleStatus("boot", "ready");

  if (configurationLooksValid() && connectWiFi()) {
    sendHeartbeat();
    lastCommandPollAt = millis();
  }
}

void loop() {
  serviceSerial();

  if (configurationLooksValid() && !recordingNow) {
    const unsigned long now = millis();
    if (now - lastCommandPollAt >= COMMAND_POLL_INTERVAL_MS) {
      lastCommandPollAt = now;
      pollForCommands();
    }
    if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      sendHeartbeat();
    }
  }

  delay(5);
}
