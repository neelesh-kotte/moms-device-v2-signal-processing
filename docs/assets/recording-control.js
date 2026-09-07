(function () {
  'use strict';

  const RECORD_LABEL = 'Begin 60-second recording';
  const RECORD_SECONDS = 60;
  const allowNextClick = new WeakSet();
  let queueBusy = false;
  let activeCommandId = null;
  let completionPromise = null;

  function selectedProfileId() {
    const select = [...document.querySelectorAll('select')].find((node) =>
      [...node.options].some((option) => option.textContent.trim() === 'Choose a profile')
    );
    return select?.value || '';
  }

  function notice(message, error = false, persist = false) {
    let node = document.getElementById('mom-recording-command-notice');
    if (!node) {
      node = document.createElement('div');
      node.id = 'mom-recording-command-notice';
      node.setAttribute('role', error ? 'alert' : 'status');
      node.setAttribute('aria-live', error ? 'assertive' : 'polite');
      Object.assign(node.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: '10000',
        width: 'min(430px, calc(100vw - 40px))', border: '1px solid #A9AA9F',
        borderLeft: '4px solid #C4402F', borderRadius: '14px', background: '#F1EEE5',
        color: '#121714', padding: '14px 16px', fontSize: '13px', lineHeight: '1.55',
        boxShadow: '0 18px 50px rgba(18,23,20,.18)'
      });
      document.body.appendChild(node);
    }
    node.textContent = message;
    if (!persist && !error) setTimeout(() => node?.remove(), 4200);
  }

  function cloud() {
    if (window.MOM?.cloud) return window.MOM.cloud;
    if (window.MOM?.CloudService) return new window.MOM.CloudService();
    throw new Error('MOM cloud services are still loading. Refresh the page and try again.');
  }

  async function queuePhysicalRecording() {
    const profileId = selectedProfileId();
    if (!profileId) throw new Error('Choose a profile before starting a recording.');
    const service = cloud();
    const command = await service.queueRecording(profileId, RECORD_SECONDS);
    activeCommandId = command.id;
    window.MOMRecordingState = { commandId: command.id, status: 'pending', sessionId: null };
    notice('Sending the recording command to your MOM device…', false, true);
    await service.waitForCommandClaim(command.id);
    window.MOMRecordingState.status = 'recording';
    notice('MOM device confirmed the recording. Keep the sensor in place for 60 seconds.');
    return { service, command };
  }

  async function monitorCompletion(service, commandId) {
    try {
      const command = await service.waitForCommandCompletion(commandId, 105000);
      const session = await service.getSessionForCommand(commandId);
      if (!session || command.result_session_id !== session.id) throw new Error('MOM confirmed completion, but the uploaded session could not be matched.');
      window.MOMRecordingState = { commandId, status: 'completed', sessionId: session.id, session };
      notice('Recording uploaded successfully. Preparing the quality review…');
      nudgeReviewWhenReady();
      return session;
    } catch (error) {
      window.MOMRecordingState = { commandId, status: 'failed', sessionId: null, error: error?.message || 'Recording failed.' };
      notice(error?.message || 'The recording could not be completed.', true, true);
      throw error;
    }
  }

  function nudgeReviewWhenReady(attempt = 0) {
    const state = window.MOMRecordingState;
    if (!state || state.status !== 'completed') return;
    const waiting = [...document.querySelectorAll('strong')].some((node) => node.textContent.trim() === 'Waiting for the device upload.');
    const refreshButton = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Refresh uploaded session');
    if (waiting && refreshButton) {
      refreshButton.click();
      return;
    }
    if (attempt < 40) setTimeout(() => nudgeReviewWhenReady(attempt + 1), 750);
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
    button.textContent = 'Starting MOM device…';
    try {
      const { service, command } = await queuePhysicalRecording();
      completionPromise = monitorCompletion(service, command.id).catch(() => null);
      button.disabled = false;
      button.textContent = original;
      allowNextClick.add(button);
      button.click();
    } catch (error) {
      activeCommandId = null;
      button.disabled = false;
      button.textContent = original;
      notice(error?.message || 'The physical MOM recording could not be started.', true, true);
    } finally {
      queueBusy = false;
    }
  }, true);

  function improveReviewCopy() {
    const strongs = [...document.querySelectorAll('strong')];
    for (const strong of strongs) {
      if (strong.textContent.trim() === 'Waiting for the device upload.') strong.textContent = 'Uploading your recording…';
    }
    for (const p of [...document.querySelectorAll('p')]) {
      if (p.textContent.includes('The browser timer completed, but MOM has not matched')) {
        p.textContent = 'Keep the MOM device powered on while the physical recording is securely transferred. MOM only shows measurements received from the device.';
      }
      if (p.textContent.includes('No uploaded session has arrived yet. Nothing was silently saved.')) {
        p.textContent = 'The upload has not been confirmed yet. Keep the device powered on and connected to Wi-Fi, then check again.';
      }
    }
    for (const button of [...document.querySelectorAll('button')]) {
      if (button.textContent.trim() === 'Refresh uploaded session') button.textContent = 'Check upload again';
      if (button.textContent.trim() === 'Try again') button.textContent = 'Start a new recording';
    }
  }

  const observer = new MutationObserver(() => {
    improveReviewCopy();
    if (window.MOMRecordingState?.status === 'completed') nudgeReviewWhenReady();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  improveReviewCopy();

  window.MOMRecordingControl = {
    get commandId() { return activeCommandId; },
    get completion() { return completionPromise; }
  };
})();
