(function () {
  'use strict';

  let queued = false;
  let lastReadinessCheck = 0;
  let previousFocus = null;

  const textMap = new Map([
    ['Why trust it', 'Evidence & limitations'],
    ['Private Dashboard', 'Open dashboard'],
    ['Start a guided recording', 'Open dashboard to record'],
    ['Run connection check', 'Check device status'],
    ['Save session', 'Keep current setting'],
    ['Save for reference only', 'Reference only']
  ]);

  function selectedProfileId() {
    const select = [...document.querySelectorAll('select')].find((node) =>
      [...node.options].some((option) => option.textContent.trim() === 'Choose a profile')
    );
    return select?.value || '';
  }

  function injectStyles() {
    if (document.getElementById('mom-site-hardening-styles')) return;
    const style = document.createElement('style');
    style.id = 'mom-site-hardening-styles';
    style.textContent = `
      :focus-visible{outline:3px solid #C4402F!important;outline-offset:3px!important}
      [data-mom-hidden-credential="true"]{display:none!important}
      .mom-readiness-note{margin-top:.7rem;font-size:.78rem;line-height:1.55;color:var(--color-slate2,#6f746f)}
      .mom-readiness-note strong{color:var(--color-warm,#121714)}
      @media(max-width:560px){
        .ui-button{min-height:46px}
        .mom-setup-dialog{max-height:calc(100dvh - 24px)!important}
        .mom-setup-backdrop{padding:12px!important}
        header .ui-button{max-width:100%}
      }
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
    `;
    document.head.appendChild(style);
  }

  function replaceExactText() {
    for (const node of [...document.querySelectorAll('button,a')]) {
      const text = node.textContent.trim();
      const replacement = textMap.get(text);
      if (replacement && text !== replacement) node.textContent = replacement;
    }

    for (const strong of [...document.querySelectorAll('strong')]) {
      const text = strong.textContent.trim();
      if (text === 'Copy this credential once') {
        const box = strong.closest('.rounded-2xl') || strong.parentElement;
        if (box) {
          box.dataset.momHiddenCredential = 'true';
          box.replaceChildren();
          box.remove();
        }
      }
      if (text === 'Would you like to keep this uploaded session?') {
        strong.textContent = 'This recording is already saved.';
        const parent = strong.parentElement;
        if (parent) parent.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.includes('The physical device has already saved')) {
            child.textContent = ' Choose whether it should keep its current research-learning setting or be reference-only.';
          }
        });
      }
    }

    for (const p of [...document.querySelectorAll('p')]) {
      if (p.textContent.trim() === 'Connection first. Technical detail only after the basics work.') {
        p.textContent = 'Connect the physical device, verify it is ready to record, then start a session.';
      }
    }
  }

  function improveForms() {
    for (const select of [...document.querySelectorAll('select')]) {
      if ([...select.options].some((option) => option.textContent.trim() === 'Choose a profile')) {
        if (!select.getAttribute('aria-label')) select.setAttribute('aria-label', 'Current MOM profile');
      }
    }
    for (const input of [...document.querySelectorAll('input')]) {
      if (input.type === 'password' && !input.autocomplete) input.autocomplete = 'current-password';
    }
  }

  function secureLegacyCredentialUI() {
    for (const node of [...document.querySelectorAll('div')]) {
      const text = node.textContent || '';
      if (text.includes('Copy this credential once') && /mom_[a-f0-9]{20,}/i.test(text)) {
        node.textContent = '';
        node.dataset.momHiddenCredential = 'true';
        node.remove();
      }
    }
  }

  function capabilityArray(device) {
    return Array.isArray(device?.capabilities) ? device.capabilities : [];
  }

  async function updateReadiness() {
    const now = Date.now();
    if (now - lastReadinessCheck < 4500) return;
    const profileId = selectedProfileId();
    if (!profileId || !window.MOM?.cloud) return;
    lastReadinessCheck = now;
    try {
      const data = await window.MOM.cloud.loadProfileData(profileId);
      const device = data.devices?.[0] || null;
      const online = window.MOM.cloud.isDeviceOnline(device);
      const ready = window.MOM.cloud.deviceCanRecord(device);
      let label = 'Device offline';
      let detail = 'Power on the device and make sure it can reach the Wi-Fi network used during setup.';
      if (online && ready) {
        label = 'Ready to record';
        detail = `${device?.firmware_version || 'MOM firmware'} · Physical recording capability verified`;
      } else if (online) {
        label = 'Update required';
        detail = 'The device can reach MOM cloud, but its firmware is not verified for physical recording. Open Device and update firmware.';
      }

      for (const node of [...document.querySelectorAll('div,span')]) {
        const text = node.textContent?.trim();
        if (['Device connected', 'Device offline', 'Ready to record', 'Update required'].includes(text)) {
          node.textContent = label;
          node.setAttribute('data-mom-readiness', ready ? 'ready' : online ? 'update' : 'offline');
        }
      }

      if (location.search.includes('tab=device')) {
        const heading = [...document.querySelectorAll('h2,h3')].find((node) => node.textContent.includes('Connect your MOM device'));
        const host = heading?.parentElement;
        if (host) {
          let note = host.querySelector('.mom-readiness-note');
          if (!note) {
            note = document.createElement('p');
            note.className = 'mom-readiness-note';
            host.appendChild(note);
          }
          note.innerHTML = `<strong>${label}</strong> · ${detail}`;
        }
      }
    } catch (_) {}
  }

  function setupDialogAccessibility() {
    const dialog = document.querySelector('#mom-device-setup .mom-setup-dialog');
    if (!dialog || dialog.dataset.a11yReady === 'true') return;
    dialog.dataset.a11yReady = 'true';
    previousFocus = document.activeElement;
    const close = dialog.querySelector('.mom-setup-close');
    setTimeout(() => close?.focus(), 0);
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close?.click();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function restoreDialogFocus() {
    if (!document.getElementById('mom-device-setup') && previousFocus instanceof HTMLElement) {
      previousFocus.focus?.();
      previousFocus = null;
    }
  }

  function markCurrentNavigation() {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    for (const button of [...document.querySelectorAll('header button, header a')]) button.removeAttribute('aria-current');
    if (tab) {
      const target = [...document.querySelectorAll('header button, header a')].find((node) => node.textContent.trim().toLowerCase() === tab.toLowerCase());
      target?.setAttribute('aria-current', 'page');
    }
  }

  function run() {
    queued = false;
    injectStyles();
    replaceExactText();
    improveForms();
    secureLegacyCredentialUI();
    setupDialogAccessibility();
    restoreDialogFocus();
    markCurrentNavigation();
    updateReadiness();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('focus', updateReadiness);
  injectStyles();
  schedule();
})();
