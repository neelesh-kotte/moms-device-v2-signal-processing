(function () {
  'use strict';

  const PROTOCOL = 'mom-provisioning-v1';
  const MANIFEST_URL = new URL('firmware/web/manifest.json', document.baseURI).href;
  const HEARTBEAT_WINDOW_MS = 120000;
  const POLL_INTERVAL_MS = 1500;
  const POLL_ATTEMPTS = 24;

  let activePort = null;
  let serialReader = null;
  let serialBuffer = '';
  let serialLoop = null;
  let setupContext = { profileId: '', profileName: 'Current profile' };
  let setupPreviousFocus = null;
  let espToolsPromise = null;
  const serialWaiters = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
    })[ch]);
  }

  function friendlySerialError(error) {
    const name = error?.name || '';
    const message = String(error?.message || '');
    if (name === 'NotFoundError') return 'No device was selected. Click Continue and choose the ESP32 / USB serial device.';
    if (name === 'SecurityError' || /user gesture|permission/i.test(message)) return 'Chrome blocked the USB chooser. Click the button again, then choose the ESP32 when Chrome asks.';
    if (name === 'InvalidStateError' || /already open|open.*port/i.test(message)) return 'The serial port is already in use. Close Arduino Serial Monitor or any other app using the ESP32, then try again.';
    if (name === 'NetworkError') return 'Chrome could not open the ESP32 serial port. Unplug it, reconnect it with a USB data cable, and try again.';
    return message || 'The ESP32 could not be opened over USB.';
  }

  function injectStyles() {
    if (document.getElementById('mom-provisioning-styles')) return;
    const style = document.createElement('style');
    style.id = 'mom-provisioning-styles';
    style.textContent = `
      button[data-mom-provisioning="true"] { min-height:48px!important; padding-left:20px!important; padding-right:20px!important; flex:1 1 240px; }
      .mom-provision-note { margin-top:10px; width:100%; font-size:12px; line-height:1.6; color:var(--muted,var(--color-slate2,#6f746f)); }
      .mom-setup-backdrop { position:fixed; inset:0; z-index:9999; display:grid; place-items:center; padding:18px; background:rgba(18,23,20,.58); backdrop-filter:blur(10px); }
      .mom-setup-dialog { width:min(720px,100%); max-height:min(820px,calc(100vh - 36px)); overflow:auto; border:1px solid var(--line,var(--color-line,#A9AA9F)); border-radius:24px; background:var(--surface,var(--color-bg,#F1EEE5)); color:var(--text,var(--color-warm,#121714)); box-shadow:0 28px 80px rgba(18,23,20,.24); }
      .mom-setup-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; padding:24px 24px 18px; border-bottom:1px solid var(--line,var(--color-line,#A9AA9F)); }
      .mom-setup-kicker { margin-bottom:6px; font-size:11px; font-weight:900; letter-spacing:.16em; text-transform:uppercase; color:var(--accent,var(--color-mint2,#C4402F)); }
      .mom-setup-title { margin:0; font-size:clamp(24px,4vw,34px); line-height:1.05; font-weight:900; letter-spacing:-.035em; }
      .mom-setup-subtitle { margin-top:9px; max-width:580px; color:var(--muted,var(--color-slate2,#6f746f)); line-height:1.65; }
      .mom-setup-close { width:42px; height:42px; flex:0 0 auto; border:1px solid var(--line,var(--color-line,#A9AA9F)); border-radius:13px; background:transparent; color:inherit; font-size:22px; cursor:pointer; }
      .mom-setup-body { padding:24px; }
      .mom-setup-progress { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:22px; }
      .mom-setup-progress span { height:5px; border-radius:999px; background:rgba(169,170,159,.42); }
      .mom-setup-progress span.is-active { background:var(--accent,var(--color-mint,#C4402F)); }
      .mom-setup-card { border:1px solid var(--line,var(--color-line,#A9AA9F)); border-radius:18px; background:rgba(241,238,229,.72); padding:18px; }
      .mom-setup-card + .mom-setup-card { margin-top:12px; }
      .mom-setup-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
      .mom-setup-check { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex:0 0 auto; background:rgba(196,64,47,.10); color:var(--accent,#C4402F); font-weight:900; }
      .mom-setup-label { display:grid; gap:7px; margin-top:15px; font-size:13px; font-weight:800; }
      .mom-setup-input,.mom-setup-select { width:100%; min-height:46px; border:1px solid var(--line,var(--color-line,#A9AA9F)); border-radius:12px; background:var(--surface,var(--color-bg,#F1EEE5)); color:var(--text,var(--color-warm,#121714)); padding:0 13px; font:inherit; }
      .mom-setup-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
      .mom-setup-button { min-height:46px; border:1px solid var(--line,var(--color-line,#A9AA9F)); border-radius:12px; padding:0 17px; background:transparent; color:var(--text,var(--color-warm,#121714)); font-weight:850; cursor:pointer; }
      .mom-setup-button.primary { border-color:var(--accent,#C4402F); background:var(--accent,#C4402F); color:#F1EEE5; }
      .mom-setup-button:disabled { opacity:.55; cursor:not-allowed; }
      .mom-setup-status { margin-top:15px; border-left:4px solid var(--accent,#C4402F); border-radius:12px; background:rgba(196,64,47,.06); padding:13px 14px; font-size:13px; line-height:1.65; }
      .mom-setup-status.error { border-left-color:#C4402F; }
      .mom-setup-muted { color:var(--muted,var(--color-slate2,#6f746f)); font-size:13px; line-height:1.65; }
      .mom-setup-success { text-align:center; padding:20px 6px 8px; }
      .mom-setup-success-dot { width:64px; height:64px; margin:0 auto 15px; border-radius:50%; display:grid; place-items:center; background:rgba(196,64,47,.10); color:var(--accent,#C4402F); font-size:30px; font-weight:900; }
      .mom-setup-install { margin-top:16px; padding:16px; border:1px dashed var(--line,var(--color-line,#A9AA9F)); border-radius:16px; }
      esp-web-install-button { --esp-tools-button-color:var(--accent,#C4402F); --esp-tools-button-text-color:#F1EEE5; --esp-tools-button-border-radius:12px; }
      @media (max-width:560px) { .mom-setup-head,.mom-setup-body { padding:18px; } .mom-setup-actions>* { width:100%; } }
    `;
    document.head.appendChild(style);
  }

  function createDialog() {
    document.getElementById('mom-device-setup')?.remove();
    setupPreviousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.id = 'mom-device-setup';
    backdrop.className = 'mom-setup-backdrop';
    backdrop.innerHTML = `<section class="mom-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="mom-setup-title"><header class="mom-setup-head"><div><div class="mom-setup-kicker">MOM DEVICE SETUP</div><h2 id="mom-setup-title" class="mom-setup-title">Connect MOM Device</h2><p class="mom-setup-subtitle">USB is used for setup. Your device credential is generated by MOM and sent directly to the ESP32 instead of being displayed.</p></div><button class="mom-setup-close" type="button" aria-label="Close setup">×</button></header><div class="mom-setup-body"><div class="mom-setup-progress"><span class="is-active"></span><span></span><span></span><span></span></div><div class="mom-setup-content"></div></div></section>`;
    document.body.appendChild(backdrop);
    const dialog = backdrop.querySelector('.mom-setup-dialog');
    const close = backdrop.querySelector('.mom-setup-close');
    close.addEventListener('click', closeDialog);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDialog(); });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    setTimeout(() => close.focus(), 0);
  }

  function setProgress(step) { [...document.querySelectorAll('#mom-device-setup .mom-setup-progress span')].forEach((bar, index) => bar.classList.toggle('is-active', index < step)); }
  function contentNode() { return document.querySelector('#mom-device-setup .mom-setup-content'); }
  function statusBox(text, error = false) { return `<div class="mom-setup-status${error ? ' error' : ''}" role="status">${escapeHtml(text)}</div>`; }

  async function closeSerial() {
    try { if (serialReader) await serialReader.cancel(); } catch (_) {}
    serialReader = null; serialLoop = null; serialBuffer = '';
    for (const waiter of [...serialWaiters]) { clearTimeout(waiter.timer); waiter.reject(new Error('Serial connection closed.')); serialWaiters.delete(waiter); }
    try { if (activePort?.readable || activePort?.writable) await activePort.close(); } catch (_) {}
    activePort = null;
  }
  async function closeDialog() { await closeSerial(); document.getElementById('mom-device-setup')?.remove(); if (setupPreviousFocus instanceof HTMLElement) setupPreviousFocus.focus?.(); setupPreviousFocus = null; }

  function dispatchSerialMessage(message) {
    for (const waiter of [...serialWaiters]) {
      let matched = false;
      try { matched = waiter.predicate(message); } catch (_) {}
      if (!matched) continue;
      clearTimeout(waiter.timer); serialWaiters.delete(waiter); waiter.resolve(message);
    }
  }
  function waitForSerial(predicate, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => { serialWaiters.delete(waiter); reject(new Error('The device did not respond in time.')); }, timeoutMs);
      serialWaiters.add(waiter);
    });
  }
  async function startReadLoop() {
    if (!activePort?.readable || serialLoop) return;
    serialReader = activePort.readable.getReader();
    const decoder = new TextDecoder();
    serialLoop = (async () => {
      try {
        while (true) {
          const { value, done } = await serialReader.read();
          if (done) break;
          serialBuffer += decoder.decode(value, { stream: true });
          let newline;
          while ((newline = serialBuffer.indexOf('\n')) >= 0) {
            const line = serialBuffer.slice(0, newline).trim();
            serialBuffer = serialBuffer.slice(newline + 1);
            if (!line.startsWith('{')) continue;
            try { dispatchSerialMessage(JSON.parse(line)); } catch (_) {}
          }
        }
      } catch (_) {} finally { try { serialReader?.releaseLock(); } catch (_) {} serialReader = null; serialLoop = null; }
    })();
  }
  async function writeSerial(payload) {
    if (!activePort?.writable) throw new Error('The MOM device is not connected over USB.');
    const writer = activePort.writable.getWriter();
    try { await writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`)); } finally { writer.releaseLock(); }
  }

  async function openAndIdentify() {
    if (!('serial' in navigator)) throw new Error('USB setup needs desktop Chrome or another browser with Web Serial support. Safari and mobile browsers cannot run this setup flow.');
    if (activePort) throw new Error('A serial connection is already open. Close this setup window and try again.');
    const port = await navigator.serial.requestPort();
    activePort = port;
    await activePort.open({ baudRate: 115200, bufferSize: 4096 });
    await startReadLoop();
    await sleep(500);
    const responsePromise = waitForSerial((message) => message?.type === 'mom-device' && message?.protocol === PROTOCOL, 7000);
    await writeSerial({ command: 'identify', protocol: PROTOCOL });
    return responsePromise;
  }
  async function scanWifi() {
    const responsePromise = waitForSerial((message) => message?.type === 'wifi_scan' && message?.protocol === PROTOCOL, 15000);
    await writeSerial({ command: 'scan_wifi', protocol: PROTOCOL });
    const response = await responsePromise;
    return Array.isArray(response.networks) ? response.networks : [];
  }

  function showStart(extraMessage = '') {
    setProgress(1);
    const supported = 'serial' in navigator;
    const content = contentNode();
    content.innerHTML = `<div class="mom-setup-card"><div class="mom-setup-row"><div><strong>1. Plug the MOM device into this computer</strong><p class="mom-setup-muted" style="margin-top:6px">Use a USB data cable. Close Arduino Serial Monitor first if it is open.</p></div><div class="mom-setup-check">1</div></div></div><div class="mom-setup-card"><div class="mom-setup-row"><div><strong>2. Let Chrome find the ESP32</strong><p class="mom-setup-muted" style="margin-top:6px">When Chrome opens the port chooser, select the ESP32 / USB serial device.</p></div><div class="mom-setup-check">2</div></div></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button primary" data-action="detect" ${supported ? '' : 'disabled'}>Continue</button><button type="button" class="mom-setup-button" data-action="installer">Install / repair MOM firmware</button></div><div data-status>${extraMessage ? statusBox(extraMessage, true) : (!supported ? statusBox('This browser does not support Web Serial. Open the MOM site in desktop Chrome.', true) : '')}</div>`;
    content.querySelector('[data-action="detect"]').addEventListener('click', detectDevice);
    content.querySelector('[data-action="installer"]').addEventListener('click', showInstaller);
  }
  async function detectDevice() {
    const content = contentNode(); const status = content.querySelector('[data-status]'); const button = content.querySelector('[data-action="detect"]');
    button.disabled = true; button.textContent = 'Finding device…'; status.innerHTML = statusBox('Choose the ESP32 / USB serial device in Chrome.');
    try { const device = await openAndIdentify(); showWifi(device); }
    catch (error) { const message = friendlySerialError(error); await closeSerial(); status.innerHTML = statusBox(`${message} If this ESP32 does not already have MOM firmware, use “Install / repair MOM firmware” below.`, true); button.disabled = false; button.textContent = 'Try another device'; }
  }
  async function showWifi(device) {
    setProgress(2);
    const content = contentNode();
    content.innerHTML = `<div class="mom-setup-card"><div class="mom-setup-row"><div><strong>Device found ✓</strong><p class="mom-setup-muted" style="margin-top:6px">${escapeHtml(device.firmware_version || 'MOM firmware detected')} · USB ready</p></div><div class="mom-setup-check">✓</div></div></div><div class="mom-setup-card"><strong>Connect MOM to Wi-Fi</strong><p class="mom-setup-muted" style="margin-top:6px">Your Wi-Fi password goes directly to the ESP32 over USB. MOM does not display or store the device credential in this page.</p><div data-networks style="margin-top:10px">${statusBox('Scanning for nearby Wi-Fi networks…')}</div><label class="mom-setup-label">Wi-Fi network<input class="mom-setup-input" data-ssid autocomplete="off" placeholder="Network name"></label><label class="mom-setup-label">Wi-Fi password<input class="mom-setup-input" data-password type="password" autocomplete="new-password" placeholder="Password"></label></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button" data-action="back">Back</button><button type="button" class="mom-setup-button primary" data-action="finish">Finish Setup</button></div><div data-status></div>`;
    content.querySelector('[data-action="back"]').addEventListener('click', async () => { await closeSerial(); showStart(); });
    content.querySelector('[data-action="finish"]').addEventListener('click', finishProvisioning);
    try { renderNetworks(await scanWifi()); } catch (_) { const target = content.querySelector('[data-networks]'); if (target) target.innerHTML = '<p class="mom-setup-muted">Nearby networks could not be listed automatically. Type the network name below.</p>'; }
  }
  function renderNetworks(networks) {
    const target = contentNode()?.querySelector('[data-networks]'); const ssidInput = contentNode()?.querySelector('[data-ssid]'); if (!target || !ssidInput) return;
    const clean = networks.filter((network) => network && typeof network.ssid === 'string' && network.ssid.trim()).sort((a,b) => Number(b.rssi || -999) - Number(a.rssi || -999));
    if (!clean.length) { target.innerHTML = '<p class="mom-setup-muted">No named networks were returned. Type the Wi-Fi name manually.</p>'; return; }
    target.innerHTML = `<label class="mom-setup-label" style="margin-top:0">Nearby networks<select class="mom-setup-select" data-network-select><option value="">Choose a network or type one below</option>${clean.map((network) => `<option value="${escapeHtml(network.ssid)}">${escapeHtml(network.ssid)}${network.secure ? ' · secured' : ' · open'}</option>`).join('')}</select></label>`;
    target.querySelector('[data-network-select]').addEventListener('change', (event) => { if (event.target.value) ssidInput.value = event.target.value; });
  }

  async function cloudContext() {
    const cloud = window.MOM?.cloud;
    if (!cloud) throw new Error('MOM cloud services are still loading. Refresh the page and try again.');
    const session = await cloud.getSession();
    if (!session?.user?.id) throw new Error('Please sign in again before connecting a device.');
    const profileId = String(setupContext.profileId || '').trim();
    if (!profileId) throw new Error('Choose a profile before connecting a MOM device.');
    return { cloud, userId: session.user.id, profileId };
  }
  async function finishProvisioning() {
    const content = contentNode(); const ssid = content.querySelector('[data-ssid]')?.value?.trim() || ''; const password = content.querySelector('[data-password]')?.value || ''; const status = content.querySelector('[data-status]'); const button = content.querySelector('[data-action="finish"]');
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
  async function waitForCloudHeartbeat(cloud, profileId, pairedAt) {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const data = await cloud.loadProfileData(profileId); const devices = data?.devices || []; const candidate = [...devices].sort((a,b) => +new Date(b.last_seen_at || 0) - +new Date(a.last_seen_at || 0))[0];
      const timestamp = candidate?.last_seen_at ? new Date(candidate.last_seen_at).getTime() : 0;
      if (timestamp >= pairedAt - 5000 && Date.now() - timestamp < HEARTBEAT_WINDOW_MS) return candidate;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error('The ESP32 reported that it was online, but the dashboard did not receive a fresh heartbeat. Refresh the page and run “Check device status.”');
  }
  async function showSuccess(device) {
    setProgress(4); const content = contentNode(); const profileName = setupContext.profileName || 'Current profile'; const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at).toLocaleString([], { hour:'numeric', minute:'2-digit' }) : 'Just now';
    const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : []; const ready = capabilities.includes('record_session');
    const title = ready ? 'MOM Device Ready' : 'MOM Device Connected';
    const subtitle = ready ? 'Cloud check-in verified. This firmware can accept physical recording commands.' : 'Cloud check-in verified, but this firmware is not yet recording-capable. Install the current MOM firmware before recording.';
    const cloudStatus = ready ? 'Ready to record' : 'Online · update required';
    content.innerHTML = `<div class="mom-setup-success"><div class="mom-setup-success-dot">✓</div><div class="mom-setup-kicker">${ready ? 'READY' : 'CONNECTED'}</div><h3 class="mom-setup-title" style="font-size:30px">${escapeHtml(title)}</h3><p class="mom-setup-subtitle" style="margin-left:auto;margin-right:auto">${escapeHtml(subtitle)}</p></div><div class="mom-setup-card"><div class="mom-setup-row"><span class="mom-setup-muted">Profile</span><strong>${escapeHtml(profileName)}</strong></div><div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Last seen</span><strong>${escapeHtml(lastSeen)}</strong></div><div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Firmware</span><strong>${escapeHtml(device?.firmware_version || 'Unknown')}</strong></div><div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Device status</span><strong>${escapeHtml(cloudStatus)}</strong></div></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button primary" data-action="done">Done</button>${ready ? '' : '<button type="button" class="mom-setup-button" data-action="installer">Update firmware</button>'}</div>`;
    await closeSerial(); content.querySelector('[data-action="done"]').addEventListener('click', async () => { await closeDialog(); location.reload(); });
    content.querySelector('[data-action="installer"]')?.addEventListener('click', showInstaller);
  }
  async function ensureEspWebTools() {
    if (customElements.get('esp-web-install-button')) return;
    if (!espToolsPromise) espToolsPromise = import('https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module');
    await espToolsPromise;
  }
  async function showInstaller() {
    await closeSerial(); setProgress(1); const content = contentNode();
    try { await ensureEspWebTools(); } catch (_) { content.innerHTML = `<div class="mom-setup-card"><strong>Firmware installer could not load</strong><p class="mom-setup-muted" style="margin-top:7px">Check your internet connection and try again in desktop Chrome.</p></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button" data-action="back">Back</button></div>`; content.querySelector('[data-action="back"]').addEventListener('click', showStart); return; }
    content.innerHTML = `<div class="mom-setup-card"><strong>Install or repair MOM firmware</strong><p class="mom-setup-muted" style="margin-top:7px">Use this when the ESP32 is blank or the normal Detect step says MOM firmware was not found. Flashing can erase the ESP32's current firmware and saved settings.</p><div class="mom-setup-install"><esp-web-install-button manifest="${escapeHtml(MANIFEST_URL)}"><button slot="activate" type="button" class="mom-setup-button primary">Install MOM firmware</button><span slot="unsupported" class="mom-setup-muted">Firmware installation needs desktop Chrome or another browser with Web Serial.</span><span slot="not-allowed" class="mom-setup-muted">Chrome needs permission to access the ESP32 USB serial port.</span></esp-web-install-button></div></div><div class="mom-setup-card"><strong>After the installer says it finished</strong><p class="mom-setup-muted" style="margin-top:7px">Close the installer window, wait a few seconds for the ESP32 to restart, then click Detect MOM Device below and select the ESP32 again.</p></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button" data-action="back">Back</button><button type="button" class="mom-setup-button primary" data-action="detect">Detect MOM Device</button></div><div data-status></div>`;
    content.querySelector('[data-action="back"]').addEventListener('click', showStart); content.querySelector('[data-action="detect"]').addEventListener('click', detectDevice);
  }

  function openWizard(context = {}) {
    setupContext = { profileId: String(context.profileId || ''), profileName: String(context.profileName || 'Current profile') };
    injectStyles(); createDialog(); showStart();
  }
  window.MOMDeviceProvisioning = { open: openWizard };
})();
