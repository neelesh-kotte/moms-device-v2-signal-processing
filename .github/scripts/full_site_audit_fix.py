from pathlib import Path

app_path = Path('docs/assets/app.js')
css_path = Path('docs/assets/scientific.css')
prov_path = Path('docs/assets/device-provisioning.js')
index_path = Path('docs/index.html')


def once(text, old, new, label):
    c = text.count(old)
    if c != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {c}')
    return text.replace(old, new, 1)

app = app_path.read_text()

# 1) Generic modal: native keyboard focus trap, focus restoration, warm theme.
old_modal = '''    function Modal({ title, children, onClose, width = 'max-w-2xl' }) {
        const ref = useRef(null);
        useEffect(() => {
            const handler = (e) => { if (e.key === 'Escape')
                onClose(); };
            document.addEventListener('keydown', handler);
            setTimeout(() => ref.current?.focus(), 0);
            return () => document.removeEventListener('keydown', handler);
        }, []);
        return React.createElement("div", { className: "fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 p-4", role: "dialog", "aria-modal": "true", "aria-label": title, onMouseDown: e => { if (e.currentTarget === e.target)
                onClose(); } },
            React.createElement("div", { ref: ref, tabIndex: -1, className: `relative max-h-[90vh] w-full ${width} overflow-y-auto rounded-[24px] border border-line bg-[#071014] p-6 focus:outline-none` },
                React.createElement("button", { onClick: onClose, className: "absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-xl text-slate2 hover:bg-white/5 hover:text-warm focus-visible:ring-2 focus-visible:ring-mint", "aria-label": "Close dialog" },
                    React.createElement(Icon, { name: "x" })),
                React.createElement("h2", { className: "pr-12 text-2xl font-black tracking-tight text-warm" }, title),
                React.createElement("div", { className: "mt-5" }, children)));
    }
'''
new_modal = '''    function Modal({ title, children, onClose, width = 'max-w-2xl' }) {
        const ref = useRef(null);
        useEffect(() => {
            const previous = document.activeElement;
            const focusable = () => [...(ref.current?.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])') ?? [])].filter(node => node.offsetParent !== null);
            const handler = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
                if (e.key !== 'Tab') return;
                const nodes = focusable();
                if (!nodes.length) { e.preventDefault(); ref.current?.focus(); return; }
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };
            document.addEventListener('keydown', handler);
            setTimeout(() => focusable()[0]?.focus() || ref.current?.focus(), 0);
            return () => { document.removeEventListener('keydown', handler); if (previous instanceof HTMLElement) previous.focus?.(); };
        }, [onClose]);
        return React.createElement("div", { className: "fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 p-4", role: "dialog", "aria-modal": "true", "aria-label": title, onMouseDown: e => { if (e.currentTarget === e.target) onClose(); } },
            React.createElement("div", { ref: ref, tabIndex: -1, className: `relative max-h-[90vh] w-full ${width} overflow-y-auto rounded-[24px] border border-line bg-panel p-6 focus:outline-none` },
                React.createElement("button", { onClick: onClose, className: "absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-xl text-slate2 hover:bg-panel2 hover:text-warm focus-visible:ring-2 focus-visible:ring-mint", "aria-label": "Close dialog" },
                    React.createElement(Icon, { name: "x" })),
                React.createElement("h2", { className: "pr-12 text-2xl font-black tracking-tight text-warm" }, title),
                React.createElement("div", { className: "mt-5" }, children)));
    }
'''
app = once(app, old_modal, new_modal, 'Modal accessibility')

# 2) Copy: do not overclaim quality metrics the current firmware does not independently measure.
app = once(app,
    '["02", "Check", "The software checks clipping, movement, sample rate, noise, contact, and recording completeness first."],',
    '["02", "Check", "The software checks the signal-quality measures the device actually reports, such as clipping, sample-rate behavior, signal range, and recording completeness. Unavailable measures are labeled as not independently measured."],',
    'Homepage quality copy')
app = once(app,
    'React.createElement("p", null, "Clipping, movement, noise, contact, sample rate, and completion are reviewed first.")),',
    'React.createElement("p", null, "MOM reviews the quality fields actually reported by the physical device and labels unavailable measures instead of pretending they were measured.")),',
    'Trust quality copy')
app = once(app,
    "['2', 'Check the signal', 'The system reviews clarity, movement, contact consistency, background noise, clipping, and completion.', 'scan-line'],",
    "['2', 'Check the signal', 'The system reviews the quality measures actually supplied by the device, including clipping and completion, and marks unavailable measures as not independently measured.', 'scan-line'],",
    'HowWorks quality copy')
app = once(app,
    "['Acquisition', '8 kHz contiguous 4096-sample windows'],",
    "['Acquisition', '8 kHz target physical sampling; analysis windowing depends on the research pipeline'],",
    'HowWorks acquisition copy')
app = once(app,
    '["ADC", "ESP32 / MAX4466", "8 kHz contiguous windows"],',
    '["ADC", "ESP32 / MAX4466", "8 kHz target physical capture"],',
    'Signal pipeline ADC copy')
app = once(app,
    '["GATE", "Signal quality", "rate · clipping · motion · noise"],',
    '["GATE", "Signal quality", "rate · clipping · completion · reported metrics"],',
    'Signal pipeline quality copy')

# 3) How/device flow arrows must respond to CSS breakpoints, not window.innerWidth at render time.
arrow_old = 'React.createElement(Icon, { name: window.innerWidth < 768 ? \'arrow-down\' : \'arrow-right\' })'
arrow_count = app.count(arrow_old)
if arrow_count != 2:
    raise SystemExit(f'Responsive arrows: expected 2 matches, found {arrow_count}')
app = app.replace(arrow_old, 'React.createElement("span", { className: "responsive-flow-arrow", "aria-hidden": "true" }, "→")')

# 4) Placement guidance: replace browser alert with inline progressive disclosure.
placement_old = '''React.createElement(Button, { variant: "ghost", onClick: () => alert('Use the same selected abdominal position for repeated recordings. Hold the stethoscope-style sensor comfortably against that position and keep contact steady during the one-minute capture.') }, "See placement guidance")'''
placement_new = '''React.createElement("details", { className: "rounded-xl border border-line bg-bg/40 px-3 py-2" },
                                React.createElement("summary", { className: "cursor-pointer text-sm font-bold text-warm" }, "Placement guidance"),
                                React.createElement("p", { className: "mt-2 max-w-xl text-sm leading-6 text-slate2" }, "Choose one comfortable external recording position and use the same position for repeated sessions. Hold the stethoscope-style sensor steadily without pressing hard."))'''
app = once(app, placement_old, placement_new, 'Placement guidance')

# 5) Recording Step 2 is a device-readiness step, not a fake live-quality screen.
app = once(app,
    "const steps = ['Prepare', 'Quality check', 'Record', 'Review', 'Check-in'];",
    "const steps = ['Prepare', 'Device check', 'Record', 'Review', 'Check-in'];",
    'Recording step names')
app = once(app,
    'React.createElement(SectionTitle, { kicker: "Step 2 \\u00B7 Live quality check", title: "Check the signal before recording." }),',
    'React.createElement(SectionTitle, { kicker: "Step 2 \\u00B7 Device check", title: "Confirm the physical device before recording.", copy: "Current firmware does not stream a live waveform to the browser. Recording quality is evaluated after the physical session uploads." }),',
    'Recording step 2 title')

start = app.index('                React.createElement("div", { className: "mt-4" },\n                    React.createElement("div", { className: "mb-2 flex items-center justify-between" },', app.index('Step 2 \\u00B7 Device check'))
end_marker = '                React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },'
end = app.index(end_marker, start)
replacement = '''                React.createElement("div", { className: "mt-4 rounded-2xl border border-line bg-bg/45 p-4" },
                    React.createElement("strong", { className: "text-warm" }, "What the browser knows right now"),
                    React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, readyDevice ? "The device checked in recently and reports physical-recording capability. The browser will send the recording command, then wait for the exact uploaded session." : online ? "The device is online, but recording capability is not verified. Update the firmware from Device before recording." : "No recent device heartbeat is available. Power on the device and confirm its Wi-Fi connection.")),
'''
app = app[:start] + replacement + app[end:]

# 6) During recording, show honest timing progress instead of an artificial waveform.
record_old = '''                React.createElement("div", { className: "mx-auto mt-6 max-w-2xl" },
                    React.createElement(Waveform, { values: MOM.demoWaveform.map((v, i) => v * (1 + ((i + seconds) % 7) / 9)), label: "Animated recording-state visualization, not stored raw audio" })),'''
record_new = '''                React.createElement("div", { className: "mx-auto mt-6 max-w-2xl" },
                    React.createElement("div", { className: "h-2 overflow-hidden rounded-full bg-bg", role: "progressbar", "aria-label": "Recording time progress", "aria-valuemin": 0, "aria-valuemax": 60, "aria-valuenow": 60 - seconds },
                        React.createElement("div", { className: "h-full bg-mint transition-all", style: { width: `${Math.max(0, Math.min(100, ((60 - seconds) / 60) * 100))}%` } })),
                    React.createElement("p", { className: "mt-3 text-sm text-slate2" }, "This is a timing indicator only. The browser does not fabricate or display live sensor samples.")),'''
app = once(app, record_old, record_new, 'Recording progress honesty')

# 7) Device setup: lazy-load provisioning only when requested and pass profile directly.
old_setup = '''        const openSetup = () => {
            if (window.MOMDeviceProvisioning?.open)
                window.MOMDeviceProvisioning.open();
            else
                setMsg('Device setup is still loading. Refresh the page and try again.');
        };'''
new_setup = '''        const openSetup = async () => {
            try {
                if (!window.MOMDeviceProvisioning?.open) {
                    setMsg('Loading secure USB setup…');
                    await new Promise((resolve, reject) => {
                        const existing = document.getElementById('mom-device-provisioning-script');
                        if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
                        const script = document.createElement('script');
                        script.id = 'mom-device-provisioning-script';
                        script.src = 'assets/device-provisioning.js?v=audit-20260907-3';
                        script.onload = resolve;
                        script.onerror = () => reject(new Error('Device setup script failed to load.'));
                        document.head.appendChild(script);
                    });
                }
                if (!window.MOMDeviceProvisioning?.open) throw new Error('Device setup did not initialize.');
                setMsg('');
                window.MOMDeviceProvisioning.open({ profileId: profile.id, profileName: profile.display_name });
            } catch (e) {
                setMsg(e instanceof Error ? e.message : 'Device setup could not load. Refresh the page and try again.');
            }
        };'''
app = once(app, old_setup, new_setup, 'Lazy device setup')

# 8) Privacy profile select gets an explicit accessible name.
app = once(app,
    'React.createElement("select", { value: profile?.id ?? \'\', onChange: e => onSwitch(e.target.value), className: "mt-4 min-h-11 w-full rounded-xl border border-line bg-bg px-3" },',
    'React.createElement("select", { value: profile?.id ?? \'\', onChange: e => onSwitch(e.target.value), "aria-label": "Current MOM profile", className: "mt-4 min-h-11 w-full rounded-xl border border-line bg-bg px-3" },',
    'Privacy profile label')

app_path.write_text(app)

# Provisioning: remove DOM scraping/observer, reuse the existing CloudService, pass profile context directly, lazy-load ESP Web Tools.
prov = prov_path.read_text()
prov = prov.replace('  let enhanceQueued = false;\n', "  let setupContext = { profileId: '', profileName: 'Current profile' };\n  let setupPreviousFocus = null;\n  let espToolsPromise = null;\n")

start = prov.index('  function selectedProfileId() {')
end = prov.index('  function createDialog() {', start)
prov = prov[:start] + prov[end:]

# Enhance dialog accessibility natively.
prov = once(prov,
    '''  function createDialog() {
    document.getElementById('mom-device-setup')?.remove();
    const backdrop = document.createElement('div');''',
    '''  function createDialog() {
    document.getElementById('mom-device-setup')?.remove();
    setupPreviousFocus = document.activeElement;
    const backdrop = document.createElement('div');''',
    'Provision dialog capture focus')
prov = once(prov,
    '''    document.body.appendChild(backdrop);
    backdrop.querySelector('.mom-setup-close').addEventListener('click', closeDialog);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDialog(); });
  }''',
    '''    document.body.appendChild(backdrop);
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
  }''',
    'Provision dialog focus trap')
prov = once(prov,
    "  async function closeDialog() { await closeSerial(); document.getElementById('mom-device-setup')?.remove(); }",
    "  async function closeDialog() { await closeSerial(); document.getElementById('mom-device-setup')?.remove(); if (setupPreviousFocus instanceof HTMLElement) setupPreviousFocus.focus?.(); setupPreviousFocus = null; }",
    'Provision focus restore')

old_cloud = '''  async function cloudContext() {
    if (!window.MOM?.CloudService) throw new Error('MOM cloud services are still loading. Refresh the page and try again.');
    const cloud = new MOM.CloudService(); const session = await cloud.getSession();
    if (!session?.user?.id) throw new Error('Please sign in again before connecting a device.');
    const profileId = selectedProfileId(); if (!profileId) throw new Error('Choose a profile before connecting a MOM device.');
    return { cloud, userId: session.user.id, profileId };
  }'''
new_cloud = '''  async function cloudContext() {
    const cloud = window.MOM?.cloud;
    if (!cloud) throw new Error('MOM cloud services are still loading. Refresh the page and try again.');
    const session = await cloud.getSession();
    if (!session?.user?.id) throw new Error('Please sign in again before connecting a device.');
    const profileId = String(setupContext.profileId || '').trim();
    if (!profileId) throw new Error('Choose a profile before connecting a MOM device.');
    return { cloud, userId: session.user.id, profileId };
  }'''
prov = once(prov, old_cloud, new_cloud, 'Provision cloud context')
prov = once(prov,
    "const content = contentNode(); const profileName = currentProfileName(); const lastSeen = device?.last_seen_at",
    "const content = contentNode(); const profileName = setupContext.profileName || 'Current profile'; const lastSeen = device?.last_seen_at",
    'Provision profile name')

# Lazy-load ESP Web Tools only if firmware installer is opened.
insert_at = prov.index('  async function showInstaller() {')
loader = '''  async function ensureEspWebTools() {
    if (customElements.get('esp-web-install-button')) return;
    if (!espToolsPromise) espToolsPromise = import('https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module');
    await espToolsPromise;
  }
'''
prov = prov[:insert_at] + loader + prov[insert_at:]
prov = once(prov,
    '''  async function showInstaller() {
    await closeSerial(); setProgress(1); const content = contentNode();
    content.innerHTML =''',
    '''  async function showInstaller() {
    await closeSerial(); setProgress(1); const content = contentNode();
    try { await ensureEspWebTools(); } catch (_) { content.innerHTML = `<div class="mom-setup-card"><strong>Firmware installer could not load</strong><p class="mom-setup-muted" style="margin-top:7px">Check your internet connection and try again in desktop Chrome.</p></div><div class="mom-setup-actions"><button type="button" class="mom-setup-button" data-action="back">Back</button></div>`; content.querySelector('[data-action="back"]').addEventListener('click', showStart); return; }
    content.innerHTML =''',
    'Lazy ESP Web Tools')

bottom_start = prov.index('  function openWizard() {')
prov = prov[:bottom_start] + '''  function openWizard(context = {}) {
    setupContext = { profileId: String(context.profileId || ''), profileName: String(context.profileName || 'Current profile') };
    injectStyles(); createDialog(); showStart();
  }
  window.MOMDeviceProvisioning = { open: openWizard };
})();
'''
prov_path.write_text(prov)

# CSS: tablet-safe header breakpoint, responsive flow arrows.
css = css_path.read_text()
addition = '''

/* Final audit: responsive navigation and flow diagrams */
.responsive-flow-arrow {
  display: grid;
  min-width: 28px;
  place-items: center;
  color: var(--accent);
  font-size: 20px;
  line-height: 1;
}
@media (max-width: 1099px) {
  .site-header__nav { display: none !important; }
  .site-header__inner > button[aria-label="Open navigation"] { display: grid !important; }
  .site-header > nav[aria-label="Mobile public navigation"] { display: block !important; }
}
@media (min-width: 1100px) {
  .site-header__nav { display: flex !important; }
  .site-header__inner > button[aria-label="Open navigation"] { display: none !important; }
  .site-header > nav[aria-label="Mobile public navigation"] { display: none !important; }
}
@media (max-width: 767px) {
  .responsive-flow-arrow { transform: rotate(90deg); margin: 4px auto; }
}
'''
if 'Final audit: responsive navigation and flow diagrams' not in css:
    css += addition
css_path.write_text(css)

# Index: public pages no longer pay for device provisioning, ESP Web Tools, hardening observer, or unused Chart.js.
index = index_path.read_text()
index = index.replace('    <script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" crossorigin></script>\n', '')
index = index.replace('    <script type="module" src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"></script>\n', '')
index = index.replace('    <script defer src="assets/device-provisioning.js?v=native-20260907-2"></script>\n', '')
index = index.replace('    <script defer src="assets/site-hardening.js?v=native-20260907-1"></script>\n', '')
index = index.replace('assets/app.js?v=learn-20260907-1', 'assets/app.js?v=audit-20260907-4')
index = index.replace('assets/scientific.css?v=audit-20260907', 'assets/scientific.css?v=audit-20260907-4')
index_path.write_text(index)
