(function () {
  'use strict';

  // Runtime safety layer for the static GitHub Pages client. This deliberately
  // wraps the existing service instead of replacing the Firebase/Supabase
  // architecture or inventing a second data path.
  const MAX_COMMAND_WAIT_MS = 95000;
  const SESSION_LOOKUP_TIMEOUT_MS = 12000;
  const ONLINE_WINDOW_MS = 120000;

  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const validId = (value) => typeof value === 'string' && value.trim().length > 0;
  const isoTime = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const errorText = (error, fallback) => {
    const message = String(error?.message || '').trim();
    return message || fallback;
  };

  function installCloudSafety() {
    const Service = window.MOM?.CloudService;
    if (!Service?.prototype || Service.prototype.__momSafetyInstalled) return;
    const proto = Service.prototype;
    proto.__momSafetyInstalled = true;

    const originalOnline = proto.isDeviceOnline;
    proto.isDeviceOnline = function (device) {
      const timestamp = isoTime(device?.last_seen_at);
      if (timestamp === null) return false;
      const age = Date.now() - timestamp;
      // A device clock that reports a future heartbeat is not treated as
      // healthy: it is safer to ask the user to refresh than claim connected.
      return age >= 0 && age <= ONLINE_WINDOW_MS;
    };

    const originalLoadProfileData = proto.loadProfileData;
    proto.loadProfileData = async function (profileId) {
      if (!validId(profileId)) throw new Error('Choose a valid MOM profile before loading its data.');
      const data = await originalLoadProfileData.call(this, profileId);
      if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.checkins) ||
          !Array.isArray(data.devices) || (data.preferences !== null && typeof data.preferences !== 'object')) {
        throw new Error('MOM received an invalid profile response. Refresh the page and try again.');
      }
      return data;
    };

    const originalSavePreferences = proto.savePreferences;
    proto.savePreferences = async function (payload) {
      if (!payload || !validId(payload.owner_id) || !validId(payload.profile_id)) {
        throw new Error('A signed-in account and profile are required to save preferences.');
      }
      if (!Array.isArray(payload.categories) || !payload.categories.every((x) => typeof x === 'string')) {
        throw new Error('Preferences contain an invalid category list. Please review the selections and try again.');
      }
      if (!payload.constraints || typeof payload.constraints !== 'object' || Array.isArray(payload.constraints)) {
        throw new Error('Preferences contain invalid practical constraints. Please review the form and try again.');
      }
      try {
        return await originalSavePreferences.call(this, payload);
      } catch (error) {
        throw new Error(`Preferences could not be saved: ${errorText(error, 'the cloud request failed')}`);
      }
    };

    const originalQueue = proto.queueRecording;
    proto.queueRecording = async function (profileId, durationSeconds = 60) {
      if (!validId(profileId)) throw new Error('Choose a profile before starting a recording.');
      const duration = Number(durationSeconds);
      if (!finite(duration) || duration < 1 || duration > 600) {
        throw new Error('Recording duration must be between 1 and 600 seconds.');
      }
      return originalQueue.call(this, profileId, duration);
    };

    const originalGetSession = proto.getSessionForCommand;
    proto.getSessionForCommand = async function (commandId, timeoutMs = SESSION_LOOKUP_TIMEOUT_MS) {
      if (!validId(commandId)) throw new Error('The recording command did not include a valid identifier.');
      const bounded = Math.max(1000, Math.min(30000, Number(timeoutMs) || SESSION_LOOKUP_TIMEOUT_MS));
      let timer;
      try {
        return await Promise.race([
          originalGetSession.call(this, commandId),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('The device reported completion, but MOM could not find the uploaded session within 12 seconds. Keep the device powered on and retry the upload check.')), bounded);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    };

    const originalWaitClaim = proto.waitForCommandClaim;
    proto.waitForCommandClaim = function (commandId, timeoutMs = 15000) {
      return originalWaitClaim.call(this, commandId, Math.max(1000, Math.min(MAX_COMMAND_WAIT_MS, Number(timeoutMs) || 15000)));
    };

    const originalWaitCompletion = proto.waitForCommandCompletion;
    proto.waitForCommandCompletion = function (commandId, timeoutMs = 95000) {
      return originalWaitCompletion.call(this, commandId, Math.max(1000, Math.min(MAX_COMMAND_WAIT_MS, Number(timeoutMs) || 95000)));
    };

    const originalSignIn = proto.signInWithGoogle;
    proto.signInWithGoogle = async function () {
      try {
        const result = await originalSignIn.call(this);
        if (result?.error && /supabase|cloud project|oauth/i.test(result.error)) {
          return { error: 'Google sign-in could not be completed. Check the Firebase authorized domain for this GitHub Pages site and try again.' };
        }
        return result;
      } catch (error) {
        const code = error?.code || '';
        if (code === 'auth/unauthorized-domain') return { error: 'Google sign-in is not authorized for this website. Add the GitHub Pages domain in Firebase Authentication settings.' };
        if (code === 'auth/popup-blocked') return { error: 'The Google sign-in popup was blocked. Allow popups for MOM and try again.' };
        if (code === 'auth/popup-closed-by-user') return { error: 'Google sign-in was cancelled.' };
        return { error: `Google sign-in failed: ${errorText(error, 'Firebase did not complete the request')}` };
      }
    };
  }

  // Loaded before app.js, so the existing CloudService constructor and React
  // application continue to be the source of truth.
  installCloudSafety();
})();
