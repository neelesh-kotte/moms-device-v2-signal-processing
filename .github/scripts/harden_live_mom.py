from pathlib import Path

app_path = Path('docs/assets/app.js')
index_path = Path('docs/index.html')
text = app_path.read_text()


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return source.replace(old, new, 1)


old = """    function isOnline(devices) {
        return devices.some(d => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 120000);
    }
"""
new = """    function isOnline(devices) {
        return devices.some(d => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 120000);
    }
    function recordingReadyDevice(devices) {
        return [...devices]
            .filter(d => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 120000)
            .sort((a, b) => +new Date(b.last_seen_at || 0) - +new Date(a.last_seen_at || 0))
            .find(d => Array.isArray(d.capabilities) && d.capabilities.includes('record_session')) || null;
    }
"""
text = replace_once(text, old, new, 'recording readiness helper')

old = """    function DevicePill({ devices, demo = false }) {
        const online = demo || isOnline(devices);
        return React.createElement(\"div\", { className: `inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${online ? 'border-mint/30 bg-mint/10 text-mint2' : 'border-amber/30 bg-amber/10 text-[#62B5A6]'}` },
            React.createElement(\"span\", { className: `h-2.5 w-2.5 rounded-full ${online ? 'bg-mint' : 'bg-amber'}` }),
            demo ? 'Demo data' : online ? 'Device connected' : 'Device offline');
    }
"""
new = """    function DevicePill({ devices, demo = false }) {
        const online = demo || isOnline(devices);
        const ready = demo || Boolean(recordingReadyDevice(devices));
        const label = demo ? 'Demo data' : ready ? 'Ready to record' : online ? 'Update required' : 'Device offline';
        return React.createElement(\"div\", { className: `inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${ready ? 'border-mint/30 bg-mint/10 text-mint2' : 'border-amber/30 bg-amber/10 text-[#62B5A6]'}` },
            React.createElement(\"span\", { className: `h-2.5 w-2.5 rounded-full ${ready ? 'bg-mint' : 'bg-amber'}` }),
            label);
    }
"""
text = replace_once(text, old, new, 'device pill')

start = text.index('    function RecordingFlow(')
end = text.index('    function SessionDetail(', start)
rec = text[start:end]
rec = replace_once(rec,
    'function RecordingFlow({ user, profile, sessions, devices, refresh, saveCheckin, updateSession })',
    'function RecordingFlow({ cloud, user, profile, sessions, devices, refresh, saveCheckin, updateSession })',
    'RecordingFlow cloud prop')
rec = replace_once(rec,
    "        const [saving, setSaving] = useState(false);\n        const [message, setMessage] = useState('');",
    "        const [saving, setSaving] = useState(false);\n        const [starting, setStarting] = useState(false);\n        const [commandId, setCommandId] = useState(null);\n        const [message, setMessage] = useState('');",
    'RecordingFlow command state')
rec = replace_once(rec,
    '        const online = isOnline(devices);',
    '        const online = isOnline(devices);\n        const readyDevice = recordingReadyDevice(devices);',
    'RecordingFlow ready device')
old_begin = """        const begin = () => { if (!profile || !online)
            return; setStarted(new Date().toISOString()); setMatched(null); setSeconds(60); setStep(2); };
"""
new_begin = """        const begin = async () => {
            if (!profile || !readyDevice || starting)
                return;
            setStarting(true);
            setMessage('Starting the physical MOM device…');
            try {
                const command = await cloud.queueRecording(profile.id, 60);
                await cloud.waitForCommandClaim(command.id, 15000);
                setCommandId(command.id);
                setStarted(new Date().toISOString());
                setMatched(null);
                setSeconds(60);
                setMessage('Physical recording started. Keep the sensor steady.');
                setStep(2);
            }
            catch (e) {
                setMessage(e instanceof Error ? e.message : 'The physical MOM recording could not be started.');
            }
            finally {
                setStarting(false);
            }
        };
"""
rec = replace_once(rec, old_begin, new_begin, 'RecordingFlow begin')
old_find = """        const findUploaded = async () => {
            if (!started)
                return;
            setMessage('Checking for the uploaded device session…');
            const fresh = await refresh();
            const threshold = new Date(started).getTime() - 5000;
            const candidate = (fresh?.sessions ?? sessions).find(s => new Date(s.started_at).getTime() >= threshold) ?? null;
            setMatched(candidate);
            setMessage(candidate ? 'Uploaded device session matched to this recording window.' : 'No uploaded session has arrived yet. Nothing was silently saved.');
        };
"""
new_find = """        const findUploaded = async () => {
            if (!commandId)
                return;
            setMessage('Uploading your recording…');
            try {
                await cloud.waitForCommandCompletion(commandId, 45000);
                const candidate = await cloud.getSessionForCommand(commandId);
                setMatched(candidate);
                setMessage(candidate ? 'Recording received from the physical MOM device.' : 'The device completed the command, but the matching session could not be found.');
                await refresh();
            }
            catch (e) {
                setMatched(null);
                setMessage(e instanceof Error ? e.message : 'The recording upload could not be confirmed.');
            }
        };
"""
rec = replace_once(rec, old_find, new_find, 'RecordingFlow exact upload match')
rec = replace_once(rec,
    'React.createElement(Button, { variant: "primary", disabled: !online, onClick: begin }, "Begin 60-second recording")',
    'React.createElement(Button, { variant: "primary", disabled: !readyDevice || starting, onClick: begin }, starting ? "Starting device…" : "Begin 60-second recording")',
    'recording button readiness')
rec = replace_once(rec,
    '!online && React.createElement("p", { className: "mt-3 text-sm text-amber" }, "Start becomes available after a paired device checks in.")',
    '!online && React.createElement("p", { className: "mt-3 text-sm text-amber" }, "Start becomes available after a paired device checks in."),\n                online && !readyDevice && React.createElement("p", { className: "mt-3 text-sm text-amber" }, "This device is online, but its firmware does not support physical recording commands yet. Open Device and install the current MOM firmware once.")',
    'recording readiness guidance')
rec = replace_once(rec,
    'React.createElement(Button, { onClick: finish }, "Finish recording")',
    'React.createElement(Button, { disabled: true }, "Recording ends automatically")',
    'early finish removal')
rec = rec.replace('"Waiting for the device upload."', '"Uploading your recording…"')
rec = rec.replace('"The browser timer completed, but MOM has not matched a newly uploaded physical-device session yet. Nothing is silently invented or saved by the browser."',
                  '"Keep the MOM device powered on while the physical session is transferred. MOM only shows measurements received from the device."')
rec = rec.replace('"Would you like to keep this uploaded session?"', '"How should MOM use this recording?"')
rec = rec.replace('" The physical device has already saved it to your private cloud history, so these controls decide whether it remains learning-eligible or reference-only."',
                  '" The recording is already in your private history. Choose whether it can contribute to this profile’s research history or remain reference-only."')
rec = rec.replace('"Save session"', '"Use in my research history"')
rec = rec.replace('"Refresh uploaded session"', '"Check upload again"')
rec = rec.replace('"Try again"', '"Start a new recording"')
rec = rec.replace("setStep(0); setMatched(null); setStarted(null);", "setStep(0); setMatched(null); setStarted(null); setCommandId(null);")
rec = rec.replace("setStep(0); setStarted(null); setMatched(null); setMessage('');", "setStep(0); setStarted(null); setMatched(null); setCommandId(null); setMessage('');")
rec = rec.replace("setStep(0);\n                            setStarted(null);", "setStep(0);\n                            setStarted(null);\n                            setCommandId(null);")
text = text[:start] + rec + text[end:]

start = text.index('    function DeviceView(')
end = text.index('    function AdvancedView(', start)
dev = text[start:end]
dev = replace_once(dev,
    "        const [checking, setChecking] = useState(false), [msg, setMsg] = useState(''), [pair, setPair] = useState(null);",
    "        const [checking, setChecking] = useState(false), [msg, setMsg] = useState('');",
    'DeviceView credential state')
dev = replace_once(dev,
    '        const d = devices[0] ?? null, online = isOnline(devices), latest = latestSession(sessions), acoustic = latest?.acoustic_summary ?? {};',
    '        const d = devices[0] ?? null, online = isOnline(devices), readyDevice = recordingReadyDevice(devices), ready = Boolean(readyDevice), latest = latestSession(sessions), acoustic = latest?.acoustic_summary ?? {};',
    'DeviceView readiness')
old_check = "        const connectionCheck = async () => { setChecking(true); setMsg('Refreshing device status…'); const fresh = await refresh(); setChecking(false); setMsg(isOnline(fresh?.devices ?? devices) ? 'A recent device heartbeat is available.' : 'No recent device heartbeat was found.'); };"
new_check = "        const connectionCheck = async () => { setChecking(true); setMsg('Checking device status…'); const fresh = await refresh(); const freshDevices = fresh?.devices ?? devices; setChecking(false); setMsg(recordingReadyDevice(freshDevices) ? 'Ready to record. The device is online and supports physical recording commands.' : isOnline(freshDevices) ? 'Device is online, but a firmware update is required before physical recording.' : 'Device is offline. Check power and Wi-Fi, then try again.'); };"
dev = replace_once(dev, old_check, new_check, 'DeviceView connection check')
old_pair = """        const pairDevice = async () => { if (!profile)
            return; setMsg('Creating a one-time device credential…'); try {
            const out = await cloud.pairDevice(user.id, profile.id);
            setPair(out);
            setMsg('Device credential created. Copy it once into firmware configuration; MOM stores only its hash.');
            await refresh();
        }
        catch (e) {
            setMsg(e instanceof Error ? e.message : 'Could not create device credential.');
        } };
"""
new_pair = """        const openSetup = () => {
            if (window.MOMDeviceProvisioning?.open)
                window.MOMDeviceProvisioning.open();
            else
                setMsg('Device setup is still loading. Refresh the page and try again.');
        };
"""
dev = replace_once(dev, old_pair, new_pair, 'DeviceView pairing flow')
old_issue = "        const issue = !online ? ['No device found', 'The dashboard is cloud-hosted, but the paired ESP32 has not checked in recently.', 'Power the ESP32 and make sure it can reach a saved Wi-Fi network or phone hotspot.'] : latest?.quality_label === 'poor' ? ['Recording quality needs attention', String(latest.quality_summary?.guidance ?? 'Movement, noise, or inconsistent contact may have limited the latest recording.'), 'Keep the sensor steady, reduce background noise, and review gain if clipping is reported.'] : ['Device ready', 'A paired device checked in recently.', 'Use the guided recording flow when you are ready.'];"
new_issue = "        const issue = !online ? ['Device offline', 'The paired ESP32 has not checked in recently.', 'Check power and Wi-Fi, then run Check device status.'] : !ready ? ['Firmware update required', 'The device is online, but it cannot accept physical recording commands yet.', 'Open Connect MOM Device and install the current MOM firmware once.'] : latest?.quality_label === 'poor' ? ['Recording quality needs attention', String(latest.quality_summary?.guidance ?? 'Movement, noise, or inconsistent contact may have limited the latest recording.'), 'Keep the sensor steady and review the latest quality details.'] : ['Ready to record', 'The device is online and recording-capable.', 'Use the guided recording flow when you are ready.'];"
dev = replace_once(dev, old_issue, new_issue, 'DeviceView issue state')
dev = dev.replace('title: "Connection first. Technical detail only when you want it."', 'title: "Connect, verify, then record."')
dev = dev.replace('copy: "Normal use does not require Arduino after firmware is flashed once. The ESP32 still needs electricity and an internet path for cloud upload."', 'copy: "Set up the device once over USB, then normal recordings run over Wi-Fi. MOM distinguishes a simple heartbeat from a device that is actually ready to record."')
dev = dev.replace("online ? 'MOM device connected' : 'MOM device offline'", "ready ? 'Ready to record' : online ? 'MOM device online · update required' : 'MOM device offline'")
dev = dev.replace("online ? 'A paired device checked in recently and can upload sessions to the cloud.' : 'No paired device has checked in recently.'", "ready ? 'The paired device is online and supports physical recording commands.' : online ? 'The device can reach MOM cloud, but its firmware must be updated before recording.' : 'No paired device has checked in recently.'")
dev = dev.replace("['ESP32', online ? 'Connected' : 'Offline']", "['ESP32', ready ? 'Ready to record' : online ? 'Online · update required' : 'Offline']")
dev = dev.replace("['Calibration / signal check', online ? 'Connection check available' : 'Connect device first']", "['Recording capability', ready ? 'Available' : online ? 'Firmware update required' : 'Connect device first']")
dev = dev.replace("checking ? 'Checking…' : 'Run connection check'", "checking ? 'Checking…' : 'Check device status'")
dev = replace_once(dev,
    'React.createElement(Button, { variant: "primary", onClick: pairDevice }, "Create device credential")',
    'React.createElement(Button, { variant: "primary", onClick: openSetup }, "Connect MOM Device")',
    'DeviceView setup button')
credential = """                    pair && React.createElement(\"div\", { className: \"mt-4 rounded-2xl border border-amber/30 bg-amber/5 p-4\" },
                        React.createElement(\"strong\", { className: \"text-warm\" }, \"Copy this credential once\"),
                        React.createElement(\"div\", { className: \"mt-2 overflow-x-auto rounded-xl bg-[#071014] p-3 font-mono text-xs text-mint2\" }, pair.token),
                        React.createElement(\"p\", { className: \"mt-3 text-xs text-slate2\" }, \"Cloud endpoint\"),
                        React.createElement(\"div\", { className: \"mt-1 overflow-x-auto rounded-xl bg-[#071014] p-3 font-mono text-xs text-slate2\" }, pair.endpoint))),
"""
dev = replace_once(dev, credential, '                ),\n', 'DeviceView credential box')
dev = dev.replace("${online ? 'border-mint bg-mint/5' : 'border-amber bg-amber/5'}", "${ready ? 'border-mint bg-mint/5' : 'border-amber bg-amber/5'}")
text = text[:start] + dev + text[end:]

text = replace_once(text,
    "tab === 'record' && React.createElement(RecordingFlow, { user: user, profile: profile, sessions: sessions, devices: devices, refresh: refresh, saveCheckin: saveCheckin, updateSession: updateSession })",
    "tab === 'record' && React.createElement(RecordingFlow, { cloud: cloud, user: user, profile: profile, sessions: sessions, devices: devices, refresh: refresh, saveCheckin: saveCheckin, updateSession: updateSession })",
    'RecordingFlow invocation')

text = text.replace('"Why trust it"', '"Evidence & limitations"')
text = text.replace('" Private Dashboard"', '" Open dashboard"')
text = text.replace('"Private Dashboard"', '"Open dashboard"')
app_path.write_text(text)

index = index_path.read_text()
index = index.replace('content="warm-minimal-v3-recording-fix"', 'content="warm-minimal-v3-native-recording"')
index = index.replace('assets/cloud-service.js?v=warm-minimal-v3', 'assets/cloud-service.js?v=recording-native-20260907-2')
index = index.replace('assets/app.js?v=warm-minimal-v3', 'assets/app.js?v=recording-native-20260907-2')
index = index.replace('assets/device-provisioning.js?v=usb-fix-20260906-3', 'assets/device-provisioning.js?v=secure-setup-20260907-2')
index = index.replace('    <script src="assets/recording-control.js?v=recording-fix-20260906-1"></script>\n', '')
index_path.write_text(index)
