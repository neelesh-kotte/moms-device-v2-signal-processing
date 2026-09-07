(function () {
  'use strict';

  const RECORD_LABEL = 'Begin 60-second recording';
  const RECORD_SECONDS = 60;
  const allowNextClick = new WeakSet();
  let queueBusy = false;
  let uploadPollTimer = null;
  let uploadPollCount = 0;

  function selectedProfileId() {
    const selects = [...document.querySelectorAll('select')];
    const profileSelect = selects.find((select) =>
      [...select.options].some((option) => option.textContent.trim() === 'Choose a profile')
    );
    return profileSelect?.value || '';
  }

  function notice(message, error = false) {
    let node = document.getElementById('mom-recording-command-notice');
    if (!node) {
      node = document.createElement('div');
      node.id = 'mom-recording-command-notice';
      node.setAttribute('role', 'status');
      Object.assign(node.style, {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: '10000',
        width: 'min(430px, calc(100vw - 40px))',
        border: '1px solid #A9AA9F',
        borderLeft: '4px solid #C4402F',
        background: '#F1EEE5',
        color: '#121714',
        padding: '14px 16px',
        fontSize: '13px',
        lineHeight: '1.55',
        boxShadow: '0 18px 50px rgba(18,23,20,.18)'
      });
      document.body.appendChild(node);
    }
    node.style.borderLeftColor = error ? '#C4402F' : '#C4402F';
    node.textContent = message;
    if (!error) setTimeout(() => node?.remove(), 4200);
  }

  function makeClient() {
    if (!window.supabase || !window.MOM?.SUPABASE_URL || !window.MOM?.SUPABASE_KEY) {
      throw new Error('MOM cloud services are still loading. Refresh the page and try again.');
    }
    return window.supabase.createClient(MOM.SUPABASE_URL, MOM.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  async function waitForDeviceClaim(client, commandId) {
    const started = Date.now();
    while (Date.now() - started < 12000) {
      const { data, error } = await client
        .from('mom_device_commands')
        .select('status,error_message')
        .eq('id', commandId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data?.status === 'claimed' || data?.status === 'completed') return data;
      if (data?.status === 'failed') throw new Error(data.error_message || 'The MOM device could not start the recording.');
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    throw new Error('The paired device is online, but it did not accept the recording command. Open Device → Connect MOM Device → Install / repair MOM firmware once, then try recording again.');
  }

  async function queuePhysicalRecording() {
    const profileId = selectedProfileId();
    if (!profileId) throw new Error('Choose a profile before starting a recording.');

    const client = makeClient();
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError) throw new Error(authError.message);
    const userId = authData?.session?.user?.id;
    if (!userId) throw new Error('Please sign in again before starting a recording.');

    const { data: device, error: deviceError } = await client
      .from('mom_devices')
      .select('id,last_seen_at,firmware_version')
      .eq('profile_id', profileId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deviceError) throw new Error(deviceError.message);
    if (!device) throw new Error('No MOM device is paired with this profile yet. Open the Device tab and connect it first.');

    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
    if (!lastSeen || Date.now() - lastSeen > 120000) {
      throw new Error('The paired MOM device is offline. Power it on and wait for the Device tab to show it online.');
    }

    const expiresAt = new Date(Date.now() + 30000).toISOString();
    const { data: command, error: commandError } = await client
      .from('mom_device_commands')
      .insert({
        owner_id: userId,
        device_id: device.id,
        profile_id: profileId,
        command: 'record_session',
        payload: { duration_seconds: RECORD_SECONDS },
        expires_at: expiresAt
      })
      .select('id,status')
      .single();
    if (commandError) throw new Error(commandError.message);

    notice('Sending the 60-second recording command to your MOM device…');
    await waitForDeviceClaim(client, command.id);
    return command.id;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('button');
    if (!button || button.textContent.trim() !== RECORD_LABEL) return;
    if (allowNextClick.has(button)) {
      allowNextClick.delete(button);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (queueBusy) return;

    queueBusy = true;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Starting physical device…';
    try {
      await queuePhysicalRecording();
      notice('MOM device accepted the command. Physical recording started.');
      button.disabled = false;
      button.textContent = original;
      allowNextClick.add(button);
      button.click();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      notice(error?.message || 'The physical MOM recording could not be started.', true);
    } finally {
      queueBusy = false;
    }
  }, true);

  function stopUploadPolling() {
    if (uploadPollTimer) clearInterval(uploadPollTimer);
    uploadPollTimer = null;
    uploadPollCount = 0;
  }

  function maybeStartUploadPolling() {
    const waiting = [...document.querySelectorAll('strong')].some((node) =>
      node.textContent.trim() === 'Waiting for the device upload.'
    );
    if (!waiting) {
      stopUploadPolling();
      return;
    }
    if (uploadPollTimer) return;

    uploadPollCount = 0;
    uploadPollTimer = setInterval(() => {
      uploadPollCount += 1;
      const stillWaiting = [...document.querySelectorAll('strong')].some((node) =>
        node.textContent.trim() === 'Waiting for the device upload.'
      );
      if (!stillWaiting || uploadPollCount > 18) {
        stopUploadPolling();
        return;
      }
      const refreshButton = [...document.querySelectorAll('button')].find((node) =>
        node.textContent.trim() === 'Refresh uploaded session'
      );
      refreshButton?.click();
    }, 1800);
  }

  new MutationObserver(maybeStartUploadPolling).observe(document.body, { childList: true, subtree: true });
  maybeStartUploadPolling();
})();
