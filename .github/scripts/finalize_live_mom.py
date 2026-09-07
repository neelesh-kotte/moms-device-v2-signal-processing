from pathlib import Path

app_path = Path('docs/assets/app.js')
cloud_path = Path('docs/assets/cloud-service.js')
prov_path = Path('docs/assets/device-provisioning.js')
index_path = Path('docs/index.html')


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return source.replace(old, new, 1)

# HOME: distinguish online heartbeat from verified recording capability.
app = app_path.read_text()
app = replace_once(
    app,
    "        const online = isOnline(devices), usable = usableSessions(sessions), summary = summaryFor(sessions, checkins), recent = sessions.slice(0, 5), latest = latestSession(sessions);",
    "        const online = isOnline(devices), readyDevice = recordingReadyDevice(devices), ready = Boolean(readyDevice), usable = usableSessions(sessions), summary = summaryFor(sessions, checkins), recent = sessions.slice(0, 5), latest = latestSession(sessions);",
    'DashboardHome readiness state'
)
app = replace_once(
    app,
    "React.createElement(\"h1\", { className: \"mt-3 text-4xl font-black tracking-[-.05em] text-warm\" }, online ? 'Ready to capture a new session?' : 'Connect the MOM device to begin')",
    "React.createElement(\"h1\", { className: \"mt-3 text-4xl font-black tracking-[-.05em] text-warm\" }, ready ? 'Ready to capture a new session?' : online ? 'Update the MOM device to record' : 'Connect the MOM device to begin')",
    'DashboardHome title'
)
old_copy = """React.createElement("p", { className: "mt-3 max-w-2xl text-slate2" }, online ? React.createElement(React.Fragment, null,
                            "Record a short abdominal-sound session, review whether it was clear enough to use, and build ",
                            profile.display_name,
                            "\\u2019s profile-separated research history.") : React.createElement(React.Fragment, null, "Not enough information for a current recording while the device is offline. Once your ESP32-based sensor reconnects, you can begin a guided recording. Your saved history remains available."))"""
new_copy = """React.createElement("p", { className: "mt-3 max-w-2xl text-slate2" }, ready ? React.createElement(React.Fragment, null,
                            "Record a short abdominal-sound session, review whether it was clear enough to use, and build ",
                            profile.display_name,
                            "\\u2019s profile-separated research history.") : online ? React.createElement(React.Fragment, null, "Your ESP32 can reach MOM cloud, but its firmware is not verified for physical recording yet. Update it once from Device, then return here to record.") : React.createElement(React.Fragment, null, "The device is offline. Once your ESP32-based sensor reconnects, you can begin a guided recording. Your saved history remains available."))"""
app = replace_once(app, old_copy, new_copy, 'DashboardHome explanation')
old_cta = """online ? React.createElement(Button, { variant: "primary", onClick: () => setTab('record') },
                                React.createElement(Icon, { name: "mic-2" }),
                                " Start guided recording") : React.createElement(Button, { variant: "primary", onClick: () => setTab('device') },
                                React.createElement(Icon, { name: "radio-tower" }),
                                " Connect MOM device")"""
new_cta = """ready ? React.createElement(Button, { variant: "primary", onClick: () => setTab('record') },
                                React.createElement(Icon, { name: "mic-2" }),
                                " Start guided recording") : React.createElement(Button, { variant: "primary", onClick: () => setTab('device') },
                                React.createElement(Icon, { name: "radio-tower" }),
                                online ? " Update MOM firmware" : " Connect MOM device")"""
app = replace_once(app, old_cta, new_cta, 'DashboardHome CTA')
app = replace_once(
    app,
    "React.createElement(\"button\", { key: title, onClick: () => setTab(tab), className: \"text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-[22px]\" }",
    "React.createElement(\"button\", { key: title, onClick: () => setTab(tab === 'record' && !ready ? 'device' : tab), className: \"text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-[22px]\" }",
    'DashboardHome action card routing'
)
app = replace_once(
    app,
    "React.createElement(SummaryCard, { summary: summary, onRecord: () => setTab('record'), onInsights: () => setTab('insights') })",
    "React.createElement(SummaryCard, { summary: summary, onRecord: () => setTab(ready ? 'record' : 'device'), onInsights: () => setTab('insights') })",
    'DashboardHome summary CTA'
)
app_path.write_text(app)

# CLOUD: add explicit cleanup for a provisioning attempt that never verifies.
cloud = cloud_path.read_text()
needle = """        async finalizeDeviceProvisioning(deviceId, keyId) {
            const now = new Date().toISOString();
            const { error } = await this.client.from('mom_device_keys').update({ revoked_at: now }).eq('device_id', deviceId).is('revoked_at', null).neq('id', keyId);
            if (error) throw new Error(error.message);
            return true;
        }
"""
replacement = needle + """        async abortDeviceProvisioning(keyId) {
            if (!keyId) return false;
            const { error } = await this.client.from('mom_device_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyId).is('revoked_at', null);
            if (error) throw new Error(error.message);
            return true;
        }
"""
cloud = replace_once(cloud, needle, replacement, 'Cloud provisioning cleanup')
cloud_path.write_text(cloud)

# PROVISIONING: finalize key rotation only after the new credential proves it works;
# revoke a newly-issued credential if setup fails before verification.
prov = prov_path.read_text()
start = prov.index('  async function finishProvisioning() {')
end = prov.index('  async function waitForCloudHeartbeat', start)
new_finish = """  async function finishProvisioning() {
    const content = contentNode(); const ssid = content.querySelector('[data-ssid]')?.value?.trim() || ''; const password = content.querySelector('[data-password]')?.value || ''; const status = content.querySelector('[data-status]'); const button = content.querySelector('[data-action=\"finish\"]');
    if (!ssid) { status.innerHTML = statusBox('Choose or type a Wi-Fi network first.', true); return; }
    if (!activePort?.writable) { status.innerHTML = statusBox('The USB connection was lost. Go back and reconnect the device.', true); return; }
    button.disabled = true; button.textContent = 'Setting up…'; setProgress(3); status.innerHTML = statusBox('Creating the device registration and sending Wi-Fi settings to the ESP32…');
    let cloud = null; let pairing = null; let verified = false;
    try {
      const context = await cloudContext(); cloud = context.cloud; const userId = context.userId; const profileId = context.profileId; const pairedAt = Date.now(); pairing = await cloud.pairDevice(userId, profileId);
      const outcomePromise = waitForSerial((message) => message?.type === 'provisioning' && ['online','wifi_error','cloud_error','error'].includes(message?.status), 45000);
      await writeSerial({ command:'provision', protocol:PROTOCOL, wifi_ssid:ssid, wifi_password:password, device_token:pairing.token, endpoint:pairing.endpoint });
      status.innerHTML = statusBox('ESP32 received the setup. Connecting to Wi-Fi and checking the MOM cloud…');
      const outcome = await outcomePromise;
      if (outcome.status === 'wifi_error') throw new Error('The ESP32 could not join that Wi-Fi network. Check the Wi-Fi name/password, then try again.');
      if (outcome.status === 'cloud_error') throw new Error('The ESP32 joined Wi-Fi, but its authenticated MOM cloud check-in failed.');
      if (outcome.status === 'error') throw new Error(outcome.message || 'The ESP32 rejected the setup data.');
      verified = true;
      await cloud.finalizeDeviceProvisioning(pairing.deviceId, pairing.keyId);
      status.innerHTML = statusBox('Authenticated device check-in received. Verifying recording readiness…');
      const device = await waitForCloudHeartbeat(cloud, profileId, pairedAt); await showSuccess(device);
    } catch (error) {
      if (cloud && pairing && !verified) { try { await cloud.abortDeviceProvisioning(pairing.keyId); } catch (_) {} }
      status.innerHTML = statusBox(error?.message || 'Setup could not be completed.', true); button.disabled = false; button.textContent = 'Try Finish Setup again';
    }
  }
"""
prov = prov[:start] + new_finish + prov[end:]
old_success_start = prov.index('  async function showSuccess(device) {')
old_success_end = prov.index('  async function showInstaller()', old_success_start)
new_success = """  async function showSuccess(device) {
    setProgress(4); const content = contentNode(); const profileName = currentProfileName(); const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : 'Just now';
    const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : []; const ready = capabilities.includes('record_session');
    const title = ready ? 'MOM Device Ready' : 'MOM Device Connected';
    const subtitle = ready ? 'Cloud check-in verified. This firmware can accept physical recording commands.' : 'Cloud check-in verified, but this firmware is not yet recording-capable. Install the current MOM firmware before recording.';
    const cloudStatus = ready ? 'Ready to record' : 'Online · update required';
    content.innerHTML = `<div class=\"mom-setup-success\"><div class=\"mom-setup-success-dot\">✓</div><div class=\"mom-setup-kicker\">${ready ? 'READY' : 'CONNECTED'}</div><h3 class=\"mom-setup-title\" style=\"font-size:30px\">${escapeHtml(title)}</h3><p class=\"mom-setup-subtitle\" style=\"margin-left:auto;margin-right:auto\">${escapeHtml(subtitle)}</p></div><div class=\"mom-setup-card\"><div class=\"mom-setup-row\"><span class=\"mom-setup-muted\">Profile</span><strong>${escapeHtml(profileName)}</strong></div><div class=\"mom-setup-row\" style=\"margin-top:10px\"><span class=\"mom-setup-muted\">Last seen</span><strong>${escapeHtml(lastSeen)}</strong></div><div class=\"mom-setup-row\" style=\"margin-top:10px\"><span class=\"mom-setup-muted\">Firmware</span><strong>${escapeHtml(device?.firmware_version || 'Unknown')}</strong></div><div class=\"mom-setup-row\" style=\"margin-top:10px\"><span class=\"mom-setup-muted\">Device status</span><strong>${escapeHtml(cloudStatus)}</strong></div></div><div class=\"mom-setup-actions\"><button type=\"button\" class=\"mom-setup-button primary\" data-action=\"done\">Done</button>${ready ? '' : '<button type=\"button\" class=\"mom-setup-button\" data-action=\"installer\">Update firmware</button>'}</div>`;
    await closeSerial(); content.querySelector('[data-action=\"done\"]').addEventListener('click', async () => { await closeDialog(); location.reload(); });
    content.querySelector('[data-action=\"installer\"]')?.addEventListener('click', showInstaller);
  }
"""
prov = prov[:old_success_start] + new_success + prov[old_success_end:]
prov = prov.replace('Refresh the page and run “Run connection check.”', 'Refresh the page and run “Check device status.”')
prov_path.write_text(prov)

# INDEX: assert the obsolete recording bridge stays gone and bump cache IDs for changed assets.
index = index_path.read_text()
if 'recording-control.js' in index:
    raise SystemExit('Obsolete recording-control.js is still present in live index')
index = index.replace('assets/cloud-service.js?v=native-20260907-1', 'assets/cloud-service.js?v=native-20260907-2')
index = index.replace('assets/app.js?v=native-20260907-1', 'assets/app.js?v=native-20260907-2')
index = index.replace('assets/device-provisioning.js?v=native-20260907-1', 'assets/device-provisioning.js?v=native-20260907-2')
index_path.write_text(index)
