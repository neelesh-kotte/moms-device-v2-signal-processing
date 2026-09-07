(function () {
  'use strict';

  const PROTOCOL = 'mom-provisioning-v1';
  const MANIFEST_URL = 'firmware/web/manifest.json';
  const HEARTBEAT_WINDOW_MS = 120000;
  const POLL_INTERVAL_MS = 1800;
  const POLL_ATTEMPTS = 28;

  let activePort = null;
  let serialReader = null;
  let serialBuffer = '';
  let serialLoop = null;
  const serialWaiters = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function injectStyles() {
    if (document.getElementById('mom-provisioning-styles')) return;
    const style = document.createElement('style');
    style.id = 'mom-provisioning-styles';
    style.textContent = `
      button[data-mom-provisioning="true"] {
        min-height: 48px !important;
        padding-left: 20px !important;
        padding-right: 20px !important;
        flex: 1 1 240px;
      }
      .mom-provision-note {
        margin-top: 10px;
        width: 100%;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-slate2, #6f746f);
      }
      .mom-setup-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(18, 23, 20, .58);
        backdrop-filter: blur(10px);
      }
      .mom-setup-dialog {
        width: min(720px, 100%);
        max-height: min(820px, calc(100vh - 36px));
        overflow: auto;
        border: 1px solid var(--color-line, #A9AA9F);
        border-radius: 24px;
        background: var(--color-bg, #F1EEE5);
        color: var(--color-warm, #121714);
        box-shadow: 0 28px 80px rgba(18, 23, 20, .24);
      }
      .mom-setup-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        padding: 24px 24px 18px;
        border-bottom: 1px solid var(--color-line, #A9AA9F);
      }
      .mom-setup-kicker {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .16em;
        text-transform: uppercase;
        color: var(--color-mint2, #C4402F);
      }
      .mom-setup-title {
        font-size: clamp(24px, 4vw, 34px);
        line-height: 1.05;
        font-weight: 900;
        letter-spacing: -.035em;
      }
      .mom-setup-subtitle {
        margin-top: 9px;
        max-width: 560px;
        color: var(--color-slate2, #6f746f);
        line-height: 1.65;
      }
      .mom-setup-close {
        width: 42px;
        height: 42px;
        flex: 0 0 auto;
        border: 1px solid var(--color-line, #A9AA9F);
        border-radius: 13px;
        background: transparent;
        color: inherit;
        font-size: 22px;
        cursor: pointer;
      }
      .mom-setup-body { padding: 24px; }
      .mom-setup-progress {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 22px;
      }
      .mom-setup-progress span {
        height: 5px;
        border-radius: 999px;
        background: rgba(169,170,159,.42);
      }
      .mom-setup-progress span.is-active { background: var(--color-mint, #C4402F); }
      .mom-setup-card {
        border: 1px solid var(--color-line, #A9AA9F);
        border-radius: 18px;
        background: rgba(241,238,229,.62);
        padding: 18px;
      }
      .mom-setup-card + .mom-setup-card { margin-top: 12px; }
      .mom-setup-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .mom-setup-check {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        background: rgba(196,64,47,.10);
        color: var(--color-mint2, #C4402F);
        font-weight: 900;
      }
      .mom-setup-label {
        display: grid;
        gap: 7px;
        margin-top: 15px;
        font-size: 13px;
        font-weight: 800;
      }
      .mom-setup-input, .mom-setup-select {
        width: 100%;
        min-height: 46px;
        border: 1px solid var(--color-line, #A9AA9F);
        border-radius: 12px;
        background: var(--color-bg, #F1EEE5);
        color: var(--color-warm, #121714);
        padding: 0 13px;
        font: inherit;
      }
      .mom-setup-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 20px;
      }
      .mom-setup-button {
        min-height: 46px;
        border: 1px solid var(--color-line, #A9AA9F);
        border-radius: 12px;
        padding: 0 17px;
        background: transparent;
        color: var(--color-warm, #121714);
        font-weight: 850;
        cursor: pointer;
      }
      .mom-setup-button.primary {
        border-color: var(--color-mint, #C4402F);
        background: var(--color-mint, #C4402F);
        color: var(--color-bg, #F1EEE5);
      }
      .mom-setup-button:disabled { opacity: .55; cursor: not-allowed; }
      .mom-setup-status {
        margin-top: 15px;
        border-left: 4px solid var(--color-mint, #C4402F);
        border-radius: 12px;
        background: rgba(196,64,47,.06);
        padding: 13px 14px;
        font-size: 13px;
        line-height: 1.65;
      }
      .mom-setup-status.error { border-left-color: #C4402F; }
      .mom-setup-muted {
        color: var(--color-slate2, #6f746f);
        font-size: 13px;
        line-height: 1.65;
      }
      .mom-setup-success {
        text-align: center;
        padding: 20px 6px 8px;
      }
      .mom-setup-success-dot {
        width: 64px;
        height: 64px;
        margin: 0 auto 15px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(196,64,47,.10);
        color: var(--color-mint2, #C4402F);
        font-size: 30px;
        font-weight: 900;
      }
      .mom-setup-networks { margin-top: 10px; }
      .mom-setup-install {
        margin-top: 16px;
        padding: 16px;
        border: 1px dashed var(--color-line, #A9AA9F);
        border-radius: 16px;
      }
      esp-web-install-button {
        --esp-tools-button-color: var(--color-mint, #C4402F);
        --esp-tools-button-text-color: var(--color-bg, #F1EEE5);
        --esp-tools-button-border-radius: 12px;
      }
      @media (max-width: 560px) {
        .mom-setup-head, .mom-setup-body { padding: 18px; }
        .mom-setup-actions > * { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function selectedProfileId() {
    const selects = [...document.querySelectorAll('select')];
    const profileSelect = selects.find((select) =>
      [...select.options].some((option) => option.textContent.trim() === 'Choose a profile')
    );
    return profileSelect?.value || '';
  }

  function currentProfileName() {
    const selects = [...document.querySelectorAll('select')];
    const profileSelect = selects.find((select) =>
      [...select.options].some((option) => option.textContent.trim() === 'Choose a profile')
    );
    return profileSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Current profile';
  }

  function enhanceDevicePage() {
    if (!location.search.includes('view=dashboard') || !location.search.includes('tab=device')) return;

    const buttons = [...document.querySelectorAll('button')];
    for (const button of buttons) {
      const text = button.textContent.trim();
      if (text === 'Create device credential' || text === 'Connect MOM Device') {
        button.textContent = 'Connect MOM Device';
        button.dataset.momProvisioning = 'true';
        button.setAttribute('aria-label', 'Connect MOM Device through USB');

        const row = button.parentElement;
        if (row && !row.querySelector('.mom-provision-note')) {
          const note = document.createElement('p');
          note.className = 'mom-provision-note';
          note.textContent = 'Plug in with USB, choose the device, and connect it to Wi-Fi. No code, tokens, or cloud settings are shown.';
          row.appendChild(note);
        }
      }
    }

    const headings = [...document.querySelectorAll('h2')];
    const deviceHeading = headings.find((node) => node.textContent.includes('Connection first. Technical detail'));
    if (deviceHeading) {
      deviceHeading.textContent = 'Connect your MOM device in a few clicks.';
      const copy = deviceHeading.parentElement?.querySelector('p');
      if (copy) copy.textContent = 'Plug in the device, choose Wi-Fi, and MOM handles registration and cloud verification automatically.';
    }

    for (const strong of [...document.querySelectorAll('strong')]) {
      if (strong.textContent.trim() === 'Copy this credential once') {
        const box = strong.closest('.rounded-2xl') || strong.parentElement;
        if (box) box.style.display = 'none';
      }
    }
  }

  function createDialog() {
    document.getElementById('mom-device-setup')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'mom-device-setup';
    backdrop.className = 'mom-setup-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML = `
      <section class="mom-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="mom-setup-title">
        <header class="mom-setup-head">
          <div>
            <div class="mom-setup-kicker">MOM DEVICE SETUP</div>
            <h2 id="mom-setup-title" class="mom-setup-title">Connect MOM Device</h2>
            <p class="mom-setup-subtitle">USB is used only for setup. Your device credential stays hidden and your Wi-Fi password is sent directly to the ESP32 over the cable.</p>
          </div>
          <button class="mom-setup-close" type="button" aria-label="Close setup">×</button>
        </header>
        <div class="mom-setup-body">
          <div class="mom-setup-progress" aria-label="Setup progress">
            <span class="is-active"></span><span></span><span></span><span></span>
          </div>
          <div class="mom-setup-content"></div>
        </div>
      </section>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.mom-setup-close').addEventListener('click', closeDialog);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeDialog();
    });
    return backdrop;
  }

  function setProgress(step) {
    const bars = [...document.querySelectorAll('#mom-device-setup .mom-setup-progress span')];
    bars.forEach((bar, index) => bar.classList.toggle('is-active', index < step));
  }

  function contentNode() {
    return document.querySelector('#mom-device-setup .mom-setup-content');
  }

  function statusBox(text, error = false) {
    return `<div class="mom-setup-status${error ? ' error' : ''}" role="status">${escapeHtml(text)}</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[ch]);
  }

  async function closeSerial() {
    try {
      if (serialReader) await serialReader.cancel();
    } catch (_) {}
    serialReader = null;
    serialLoop = null;
    serialBuffer = '';
    serialWaiters.forEach((waiter) => waiter.reject(new Error('Serial connection closed.')));
    serialWaiters.clear();
    try {
      if (activePort?.readable || activePort?.writable) await activePort.close();
    } catch (_) {}
    activePort = null;
  }

  async function closeDialog() {
    await closeSerial();
    document.getElementById('mom-device-setup')?.remove();
  }

  function dispatchSerialMessage(message) {
    for (const waiter of [...serialWaiters]) {
      let matched = false;
      try { matched = waiter.predicate(message); } catch (_) {}
      if (matched) {
        clearTimeout(waiter.timer);
        serialWaiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  }

  function waitForSerial(predicate, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        serialWaiters.delete(waiter);
        reject(new Error('The device did not respond in time.'));
      }, timeoutMs);
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
      } catch (_) {
        // Closing a port cancels the reader and lands here on some browsers.
      } finally {
        try { serialReader?.releaseLock(); } catch (_) {}
        serialReader = null;
        serialLoop = null;
      }
    })();
  }

  async function writeSerial(payload) {
    if (!activePort?.writable) throw new Error('The MOM device is not connected over USB.');
    const writer = activePort.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
    } finally {
      writer.releaseLock();
    }
  }

  async function openAndIdentify() {
    if (!('serial' in navigator)) {
      throw new Error('This browser does not provide USB serial access. Open this page in a desktop browser that supports Web Serial.');
    }

    await closeSerial();
    activePort = await navigator.serial.requestPort();
    await activePort.open({ baudRate: 115200, bufferSize: 4096 });
    await startReadLoop();
    await sleep(750);

    const responsePromise = waitForSerial(
      (message) => message?.type === 'mom-device' && message?.protocol === PROTOCOL,
      6500
    );
    await writeSerial({ command: 'identify', protocol: PROTOCOL });
    return responsePromise;
  }

  async function scanWifi() {
    const responsePromise = waitForSerial(
      (message) => message?.type === 'wifi_scan' && message?.protocol === PROTOCOL,
      12000
    );
    await writeSerial({ command: 'scan_wifi', protocol: PROTOCOL });
    const response = await responsePromise;
    return Array.isArray(response.networks) ? response.networks : [];
  }

  function showStart() {
    setProgress(1);
    const content = contentNode();
    content.innerHTML = `
      <div class="mom-setup-card">
        <div class="mom-setup-row">
          <div>
            <strong>1. Plug the MOM device into this computer</strong>
            <p class="mom-setup-muted" style="margin-top:6px">Use a USB data cable. Leave the device connected until setup finishes.</p>
          </div>
          <div class="mom-setup-check">1</div>
        </div>
      </div>
      <div class="mom-setup-card">
        <div class="mom-setup-row">
          <div>
            <strong>2. Let the browser find the ESP32</strong>
            <p class="mom-setup-muted" style="margin-top:6px">Your browser will show its normal serial-port chooser. Pick the ESP32 / USB serial device.</p>
          </div>
          <div class="mom-setup-check">2</div>
        </div>
      </div>
      <div class="mom-setup-actions">
        <button type="button" class="mom-setup-button primary" data-action="detect">Continue</button>
        <button type="button" class="mom-setup-button" data-action="installer">Install / repair MOM firmware</button>
      </div>
      <div data-status></div>
    `;
    content.querySelector('[data-action="detect"]').addEventListener('click', detectDevice);
    content.querySelector('[data-action="installer"]').addEventListener('click', showInstaller);
  }

  async function detectDevice() {
    const content = contentNode();
    const status = content.querySelector('[data-status]');
    const button = content.querySelector('[data-action="detect"]');
    button.disabled = true;
    button.textContent = 'Finding device…';
    status.innerHTML = statusBox('Choose your MOM device in the browser window.');

    try {
      const device = await openAndIdentify();
      showWifi(device);
    } catch (error) {
      await closeSerial();
      status.innerHTML = statusBox(error?.message || 'MOM firmware was not detected on that device.', true);
      const installerButton = content.querySelector('[data-action="installer"]');
      if (installerButton) installerButton.textContent = 'Install / repair firmware';
      button.disabled = false;
      button.textContent = 'Try another device';
    }
  }

  async function showWifi(device) {
    setProgress(2);
    const content = contentNode();
    content.innerHTML = `
      <div class="mom-setup-card">
        <div class="mom-setup-row">
          <div>
            <strong>Device found ✓</strong>
            <p class="mom-setup-muted" style="margin-top:6px">${escapeHtml(device.firmware_version || 'MOM firmware detected')} · USB connection ready</p>
          </div>
          <div class="mom-setup-check">✓</div>
        </div>
      </div>
      <div class="mom-setup-card">
        <strong>Connect MOM to Wi-Fi</strong>
        <p class="mom-setup-muted" style="margin-top:6px">The password goes directly to the ESP32 over USB. It is not saved by this webpage or written to your MOM cloud profile.</p>
        <div class="mom-setup-networks" data-networks>${statusBox('Scanning for nearby Wi-Fi networks…')}</div>
        <label class="mom-setup-label">Wi-Fi network
          <input class="mom-setup-input" data-ssid autocomplete="off" placeholder="Network name">
        </label>
        <label class="mom-setup-label">Wi-Fi password
          <input class="mom-setup-input" data-password type="password" autocomplete="new-password" placeholder="Password (leave blank for an open network)">
        </label>
      </div>
      <div class="mom-setup-actions">
        <button type="button" class="mom-setup-button" data-action="back">Back</button>
        <button type="button" class="mom-setup-button primary" data-action="finish">Finish Setup</button>
      </div>
      <div data-status></div>
    `;

    content.querySelector('[data-action="back"]').addEventListener('click', async () => {
      await closeSerial();
      showStart();
    });
    content.querySelector('[data-action="finish"]').addEventListener('click', finishProvisioning);

    try {
      const networks = await scanWifi();
      renderNetworks(networks);
    } catch (_) {
      const target = content.querySelector('[data-networks]');
      if (target) target.innerHTML = '<p class="mom-setup-muted">Nearby networks could not be listed automatically. Type the network name below.</p>';
    }
  }

  function renderNetworks(networks) {
    const target = contentNode()?.querySelector('[data-networks]');
    const ssidInput = contentNode()?.querySelector('[data-ssid]');
    if (!target || !ssidInput) return;

    const clean = networks
      .filter((network) => network && typeof network.ssid === 'string' && network.ssid.trim())
      .sort((a, b) => Number(b.rssi || -999) - Number(a.rssi || -999));

    if (!clean.length) {
      target.innerHTML = '<p class="mom-setup-muted">No named Wi-Fi networks were returned. You can type the network name manually.</p>';
      return;
    }

    target.innerHTML = `
      <label class="mom-setup-label" style="margin-top:0">Nearby networks
        <select class="mom-setup-select" data-network-select>
          <option value="">Choose a network or type one below</option>
          ${clean.map((network) => `<option value="${escapeHtml(network.ssid)}">${escapeHtml(network.ssid)}${network.secure ? ' · secured' : ' · open'}</option>`).join('')}
        </select>
      </label>
    `;
    target.querySelector('[data-network-select]').addEventListener('change', (event) => {
      if (event.target.value) ssidInput.value = event.target.value;
    });
  }

  async function cloudContext() {
    if (!window.MOM?.CloudService) throw new Error('MOM cloud services are still loading.');
    const cloud = new MOM.CloudService();
    const session = await cloud.getSession();
    if (!session?.user?.id) throw new Error('Please sign in again before connecting a device.');
    const profileId = selectedProfileId();
    if (!profileId) throw new Error('Choose a profile before connecting a MOM device.');
    return { cloud, userId: session.user.id, profileId };
  }

  async function finishProvisioning() {
    const content = contentNode();
    const ssid = content.querySelector('[data-ssid]')?.value?.trim() || '';
    const password = content.querySelector('[data-password]')?.value || '';
    const status = content.querySelector('[data-status]');
    const button = content.querySelector('[data-action="finish"]');

    if (!ssid) {
      status.innerHTML = statusBox('Choose or type a Wi-Fi network first.', true);
      return;
    }
    if (!activePort?.writable) {
      status.innerHTML = statusBox('The USB connection was lost. Go back and reconnect the device.', true);
      return;
    }

    button.disabled = true;
    button.textContent = 'Setting up…';
    setProgress(3);
    status.innerHTML = statusBox('Registering this MOM device securely with your selected profile…');

    try {
      const { cloud, userId, profileId } = await cloudContext();
      const pairedAt = Date.now();
      const pairing = await cloud.pairDevice(userId, profileId);

      const savedPromise = waitForSerial(
        (message) => message?.type === 'provisioning' && ['saved', 'wifi_error', 'cloud_error'].includes(message?.status),
        10000
      );

      await writeSerial({
        command: 'provision',
        protocol: PROTOCOL,
        wifi_ssid: ssid,
        wifi_password: password,
        device_token: pairing.token,
        endpoint: pairing.endpoint
      });

      const saved = await savedPromise;
      if (saved.status === 'wifi_error') throw new Error('The ESP32 could not join that Wi-Fi network. Check the network name and password.');
      if (saved.status === 'cloud_error') throw new Error('Wi-Fi connected, but the MOM cloud did not accept the first check-in.');

      status.innerHTML = statusBox('Wi-Fi settings saved. Verifying the first authenticated cloud check-in…');
      const device = await waitForCloudHeartbeat(cloud, profileId, pairedAt);
      showSuccess(device);
    } catch (error) {
      status.innerHTML = statusBox(error?.message || 'Setup could not be completed.', true);
      button.disabled = false;
      button.textContent = 'Try Finish Setup again';
    }
  }

  async function waitForCloudHeartbeat(cloud, profileId, pairedAt) {
    let lastDevice = null;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const data = await cloud.loadProfileData(profileId);
      const devices = data?.devices || [];
      lastDevice = devices[0] || lastDevice;
      const timestamp = lastDevice?.last_seen_at ? new Date(lastDevice.last_seen_at).getTime() : 0;
      const recentEnough = timestamp >= pairedAt - 5000 && Date.now() - timestamp < HEARTBEAT_WINDOW_MS;
      if (recentEnough) return lastDevice;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error('The device saved its setup, but no fresh cloud heartbeat appeared. Keep it powered and verify that this Wi-Fi network has internet access.');
  }

  async function showSuccess(device) {
    setProgress(4);
    const content = contentNode();
    const profileName = currentProfileName();
    const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at).toLocaleString([], { hour: 'numeric', minute: '2-digit' }) : 'Just now';
    content.innerHTML = `
      <div class="mom-setup-success">
        <div class="mom-setup-success-dot">✓</div>
        <div class="mom-setup-kicker">CONNECTED</div>
        <h3 class="mom-setup-title" style="font-size:30px">MOM Device Connected</h3>
        <p class="mom-setup-subtitle" style="margin-left:auto;margin-right:auto">The cloud received a fresh authenticated heartbeat from the physical ESP32. The device credential never appeared on screen.</p>
      </div>
      <div class="mom-setup-card">
        <div class="mom-setup-row"><span class="mom-setup-muted">Profile</span><strong>${escapeHtml(profileName)}</strong></div>
        <div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Last seen</span><strong>${escapeHtml(lastSeen)}</strong></div>
        <div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Firmware</span><strong>${escapeHtml(device?.firmware_version || 'MOM SenseLoop 1.0')}</strong></div>
        <div class="mom-setup-row" style="margin-top:10px"><span class="mom-setup-muted">Cloud status</span><strong>Verified online</strong></div>
      </div>
      <div class="mom-setup-actions">
        <button type="button" class="mom-setup-button primary" data-action="done">Done</button>
      </div>
    `;
    await closeSerial();
    content.querySelector('[data-action="done"]').addEventListener('click', async () => {
      await closeDialog();
      location.reload();
    });
  }

  async function showInstaller() {
    await closeSerial();
    setProgress(1);
    const content = contentNode();
    content.innerHTML = `
      <div class="mom-setup-card">
        <strong>Install or repair MOM firmware</strong>
        <p class="mom-setup-muted" style="margin-top:7px">Use this only when a blank ESP32 or damaged install is not detected by the normal Connect flow. Installation may erase the device's current firmware and saved settings.</p>
        <div class="mom-setup-install">
          <esp-web-install-button manifest="${MANIFEST_URL}">
            <button slot="activate" type="button" class="mom-setup-button primary">Install MOM firmware</button>
            <span slot="unsupported" class="mom-setup-muted">Firmware installation is not supported by this browser.</span>
            <span slot="not-allowed" class="mom-setup-muted">Firmware installation requires this HTTPS page to have permission to use USB serial.</span>
          </esp-web-install-button>
        </div>
      </div>
      <div class="mom-setup-actions">
        <button type="button" class="mom-setup-button" data-action="back">Back</button>
        <button type="button" class="mom-setup-button primary" data-action="detect">I installed it · Detect MOM Device</button>
      </div>
      <div data-status></div>
    `;
    content.querySelector('[data-action="back"]').addEventListener('click', showStart);
    content.querySelector('[data-action="detect"]').addEventListener('click', detectDevice);
  }

  function openWizard() {
    injectStyles();
    createDialog();
    showStart();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-mom-provisioning="true"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openWizard();
  }, true);

  injectStyles();
  enhanceDevicePage();
  new MutationObserver(enhanceDevicePage).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => setTimeout(enhanceDevicePage, 0));
})();
