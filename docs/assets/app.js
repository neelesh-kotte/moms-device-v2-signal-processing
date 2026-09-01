
var MOM;
(function (MOM) {
    const { useState, useEffect, useMemo, useRef } = React;
    const dashTabs = [
        { id: 'home', label: 'Home', icon: 'house' },
        { id: 'record', label: 'Record', icon: 'mic-2' },
        { id: 'sessions', label: 'Sessions', icon: 'history' },
        { id: 'insights', label: 'Insights', icon: 'chart-no-axes-column-increasing' },
        { id: 'preferences', label: 'Preferences', icon: 'utensils' },
        { id: 'privacy', label: 'Privacy', icon: 'shield-check' },
        { id: 'device', label: 'Device', icon: 'radio-tower' },
        { id: 'advanced', label: 'Advanced', icon: 'braces' }
    ];
    const categoryOptions = ['Savory', 'Sweet', 'Fresh', 'Warm', 'Crunchy', 'Filling', 'No preference'];
    const dietaryOptions = ['Vegetarian', 'Vegan', 'No dairy', 'No nuts', 'No preference'];
    function readRoute() {
        const p = new URLSearchParams(location.search);
        const raw = p.get('view');
        const view = raw === 'how' || raw === 'guest' || raw === 'signin' || raw === 'dashboard' ? raw : 'home';
        const tabRaw = p.get('tab');
        const tab = dashTabs.some(x => x.id === tabRaw) ? tabRaw : 'home';
        return { view, tab };
    }
    function pushRoute(view, tab, replace = false) {
        const url = new URL(location.href);
        url.search = '';
        if (view !== 'home')
            url.searchParams.set('view', view);
        if (view === 'dashboard' && tab)
            url.searchParams.set('tab', tab);
        const method = replace ? 'replaceState' : 'pushState';
        history[method]({}, '', url.toString());
        window.dispatchEvent(new PopStateEvent('popstate'));
    }
    function fmt(value) {
        if (!value)
            return 'Not available';
        try {
            return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        }
        catch {
            return 'Not available';
        }
    }
    function fmtShort(value) {
        if (!value)
            return 'Not available';
        try {
            return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        catch {
            return 'Not available';
        }
    }
    function asNumber(value) {
        const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
        return Number.isFinite(n) ? n : null;
    }
    function qualityName(q) {
        if (q === 'good')
            return 'Usable';
        if (q === 'fair')
            return 'Needs review';
        if (q === 'poor')
            return 'Limited quality';
        if (q === 'incomplete')
            return 'Incomplete';
        return 'Awaiting review';
    }
    function qualityTone(q) {
        if (q === 'good')
            return 'good';
        if (q === 'fair' || q === 'poor')
            return 'warn';
        return 'neutral';
    }
    function usableSessions(sessions) {
        return sessions.filter(s => ['good', 'fair'].includes(String(s.quality_label)) && s.learning_eligible !== false);
    }
    function evidenceLevel(count) {
        if (count === 0)
            return 'No history yet';
        if (count < 4)
            return 'Early history';
        if (count < 8)
            return 'Growing history';
        return 'Established personal dataset';
    }
    function isOnline(devices) {
        return devices.some(d => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 120000);
    }
    function latestSession(sessions) {
        return sessions.length ? [...sessions].sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at))[0] : null;
    }
    function summaryFor(sessions, checkins) {
        const latest = latestSession(sessions);
        const usable = usableSessions(sessions);
        const explicit = latest?.acoustic_summary?.experimental_summary;
        if (latest && ['poor', 'incomplete'].includes(String(latest.quality_label))) {
            return {
                status: 'review',
                title: 'Your latest recording needs review',
                supportText: `${qualityName(latest.quality_label)} · ${fmt(latest.started_at)}`,
                explanation: latest.quality_summary?.guidance ? String(latest.quality_summary.guidance) : 'Recording quality was limited, so MOM will not silently treat this session as strong model evidence.'
            };
        }
        if (explicit?.status === 'available') {
            const estimate = asNumber(explicit.estimated_hunger);
            return {
                status: 'available',
                title: 'Experimental pattern summary available',
                modelType: explicit.modelType ?? 'personal',
                evidenceLevel: explicit.evidenceLevel ?? evidenceLevel(usable.length),
                supportText: explicit.supportText ?? `Based on ${usable.length} usable sessions and ${checkins.length} optional check-ins.`,
                explanation: explicit.explanation ?? 'This result is based on the available recordings and optional check-ins for this profile.',
                estimate: estimate ?? undefined
            };
        }
        if (usable.length >= 8 && checkins.length === 0) {
            return {
                status: 'available',
                title: 'Sound-only research view available',
                modelType: 'sound',
                evidenceLevel: evidenceLevel(usable.length),
                supportText: `Based on ${usable.length} usable acoustic recordings.`,
                explanation: 'Optional check-ins are not available for this profile, so MOM can only present an acoustic-only research view. No objective hunger conclusion is made.'
            };
        }
        if (usable.length >= 8 && checkins.length > 0) {
            return {
                status: 'insufficient',
                title: 'Not enough information for a reliable experimental summary',
                evidenceLevel: evidenceLevel(usable.length),
                supportText: `${usable.length} usable recordings and ${checkins.length} optional check-ins are stored.`,
                explanation: 'A personalized model output has not been uploaded with sufficient support yet. MOM does not invent a result just because enough sessions exist.'
            };
        }
        return {
            status: 'insufficient',
            title: sessions.length === 0 ? 'No recordings yet' : 'More usable sessions are needed',
            evidenceLevel: evidenceLevel(usable.length),
            supportText: `${usable.length} of 8 suggested usable sessions collected · ${checkins.length} optional check-in${checkins.length === 1 ? '' : 's'}.`,
            explanation: sessions.length === 0
                ? 'Start with a short guided recording to begin building this profile’s research history.'
                : 'MOM chooses not to over-interpret limited or uncertain data.'
        };
    }
    function metricLabel(value, fallback = 'Not reported') {
        if (value === null || value === undefined || value === '')
            return fallback;
        if (typeof value === 'boolean')
            return value ? 'Detected' : 'None detected';
        if (typeof value === 'number')
            return Number.isInteger(value) ? String(value) : value.toFixed(2);
        return String(value);
    }
    function qualityMetricRows(session) {
        const q = session?.quality_summary ?? {};
        return [
            { label: 'Contact consistency', value: metricLabel(q.contactConsistency), help: q.contactConsistency ? 'How steadily the sensor remained in contact.' : 'The firmware did not report a contact-consistency metric for this session.' },
            { label: 'Background noise', value: metricLabel(q.backgroundNoise), help: q.backgroundNoise ? 'How much surrounding sound affected the recording.' : 'The firmware did not report a background-noise metric for this session.' },
            { label: 'Motion stability', value: metricLabel(q.motionStability), help: q.motionStability ? 'Whether movement may have changed the captured signal.' : 'The firmware did not report a motion-stability metric for this session.' },
            { label: 'Clipping / gain', value: q.clipping !== undefined ? metricLabel(q.clipping) : metricLabel(q.gainLevel), help: 'Whether the microphone level exceeded the usable recording range.' },
            { label: 'Recording completion', value: metricLabel(q.completion, session?.duration_seconds ? `${session.duration_seconds} sec saved` : 'Not reported'), help: 'Whether the expected recording interval was completed.' }
        ];
    }
    function safeFileName(value) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
    }
    function downloadJson(name, value) {
        const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function Icon({ name, size = 19, className = '' }) {
        const iconPaths = {
            waveform: ['M2 12h3l2-6 4 12 3-9 3 6h5'],
            lock: ['M6 10V8a6 6 0 0 1 12 0v2', 'M5 10h14v11H5z', 'M12 14v3'],
            user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
            arrow: ['M5 12h14', 'm14 6 6 6-6 6'],
            check: ['M5 13l4 4L19 7'],
            alert: ['M12 3 2 21h20L12 3Z', 'M12 9v5', 'M12 18h.01'],
            menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
            chart: ['M5 20V10', 'M12 20V4', 'M19 20v-7'],
            settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M4 12h2m12 0h2M12 4v2m0 12v2'],
            radio: ['M12 12h.01', 'M8.5 8.5a5 5 0 0 0 0 7', 'M5.5 5.5a9 9 0 0 0 0 13'],
            document: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
            default: ['M4 12h16', 'M12 4v16']
        };
        const key = /lock|shield|privacy/.test(name) ? 'lock'
            : /user|profile|people/.test(name) ? 'user'
            : /arrow|chevron|log-out/.test(name) ? 'arrow'
            : /check|circle-check/.test(name) ? 'check'
            : /alert|triangle/.test(name) ? 'alert'
            : /menu/.test(name) ? 'menu'
            : /chart|activity|timeline/.test(name) ? 'chart'
            : /settings|sliders/.test(name) ? 'settings'
            : /wifi|radio|cloud/.test(name) ? 'radio'
            : /file|download|calendar|clipboard/.test(name) ? 'document'
            : /wave|mic|audio|stethoscope|scan|signal/.test(name) ? 'waveform'
            : 'default';
        return React.createElement('svg', {
            viewBox: '0 0 24 24',
            width: size,
            height: size,
            className: `mom-icon ${className}`,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.65,
            strokeLinecap: 'square',
            strokeLinejoin: 'miter',
            'aria-hidden': 'true'
        }, iconPaths[key].map((d, index) => React.createElement('path', { d, key: index })));
    }
        function Logo() {
        return React.createElement("div", { className: "mom-logo" },
            React.createElement("div", { className: "mom-logo__mark" },
                React.createElement(Icon, { name: "audio-waveform", size: 21 })),
            React.createElement("div", null,
                React.createElement("div", { className: "mom-logo__name" }, "MOM SenseLoop"),
                React.createElement("div", { className: "mom-logo__meta" }, "Research prototype")));
    }
    function Button({ children, onClick, variant = 'secondary', disabled = false, type = 'button', className = '', ariaLabel }) {
        const styles = {
            primary: 'border-mint bg-mint text-[#071014] hover:bg-mint2',
            secondary: 'border-line bg-panel2 text-warm hover:border-mint/55 hover:bg-[#071014]',
            ghost: 'border-transparent bg-transparent text-slate hover:bg-white/5 hover:text-warm',
            danger: 'border-coral/45 bg-coral/10 text-[#62B5A6] hover:bg-coral/20',
            google: 'border-white/20 bg-white text-[#071014] hover:bg-[#EAF0EF]'
        };
        return React.createElement("button", { type: type, "aria-label": ariaLabel, disabled: disabled, onClick: onClick, className: `ui-button ui-button--${variant} ${className}` }, children);
    }
    function Badge({ children, tone = 'neutral' }) {
        const map = {
            neutral: 'border-line bg-white/[0.035] text-slate2',
            good: 'border-mint/35 bg-mint/10 text-mint2',
            warn: 'border-amber/35 bg-amber/10 text-[#62B5A6]',
            demo: 'border-amber/35 bg-amber/10 text-[#62B5A6]',
            coral: 'border-coral/35 bg-coral/10 text-[#62B5A6]'
        };
        return React.createElement("span", { className: `ui-badge ui-badge--${tone}` }, children);
    }
    function Card({ children, className = '', as = 'div' }) {
        const Tag = as;
        return React.createElement(Tag, { className: `editorial-panel ${className}` }, children);
    }
    function SectionTitle({ kicker, title, copy }) {
        return React.createElement("div", { className: "section-title" },
            React.createElement("div", { className: "section-title__kicker" }, kicker),
            React.createElement("h2", { className: "section-title__heading" }, title),
            copy && React.createElement("p", { className: "section-title__copy" }, copy));
    }
    function Waveform({ values = MOM.demoWaveform, label = 'Illustrative waveform', demo = false, compact = false }) {
        const w = 800, h = compact ? 90 : 190;
        const safeValues = values && values.length > 1 ? values : MOM.demoWaveform;
        const max = Math.max(...safeValues.map(v => Math.abs(v)), 0.001);
        const points = safeValues.map((v, i) => {
            const x = (i / (safeValues.length - 1)) * w;
            const y = h / 2 - (v / max) * (h * 0.38);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return React.createElement("div", { className: "relative overflow-hidden rounded-2xl border border-line bg-[#071014] p-4", role: "img", "aria-label": `${demo ? 'Demo data. ' : ''}${label}` },
            demo && React.createElement("div", { className: "absolute left-3 top-3 z-10" },
                React.createElement(Badge, { tone: "demo" }, "Demo data")),
            React.createElement("svg", { viewBox: `0 0 ${w} ${h}`, className: `w-full ${compact ? 'h-20' : 'h-44'}`, preserveAspectRatio: "none", "aria-hidden": "true" },
                [.25, .5, .75].map(v => React.createElement("line", { key: v, x1: "0", x2: w, y1: h * v, y2: h * v, stroke: "#283A42", strokeWidth: "1" })),
                React.createElement("polyline", { points: points, fill: "none", stroke: "#62B5A6", strokeWidth: compact ? 4 : 3, strokeLinejoin: "miter", strokeLinecap: "square" })));
    }
    function LoadingState({ label = 'Loading MOM SenseLoop…' }) {
        return React.createElement("div", { className: "grid min-h-[240px] place-items-center rounded-[22px] border border-line bg-panel/70 p-8 text-center", role: "status", "aria-live": "polite" },
            React.createElement("div", null,
                React.createElement("div", { className: "mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-mint motion-reduce:animate-none" }),
                React.createElement("p", { className: "font-bold text-slate2" }, label)));
    }
    function EmptyState({ icon = 'circle-dashed', title, copy, action }) {
        return React.createElement("div", { className: "rounded-[22px] border border-dashed border-line bg-white/[0.02] p-8 text-center" },
            React.createElement("div", { className: "mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-mint2" },
                React.createElement(Icon, { name: icon })),
            React.createElement("h3", { className: "text-lg font-black text-warm" }, title),
            React.createElement("p", { className: "mx-auto mt-2 max-w-xl text-slate2" }, copy),
            action && React.createElement("div", { className: "mt-5" }, action));
    }
    function Modal({ title, children, onClose, width = 'max-w-2xl' }) {
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
    function scrollPublicSection(id) {
        if (readRoute().view !== 'home') {
            pushRoute('home');
            window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
            return;
        }
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function PublicNav({ onPrivate }) {
        const [mobile, setMobile] = useState(false);
        return React.createElement("header", { className: "site-header" },
            React.createElement("div", { className: "site-header__inner" },
                React.createElement("button", { onClick: () => pushRoute('home'), className: "rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint" },
                    React.createElement(Logo, null)),
                React.createElement("nav", { className: "site-header__nav", "aria-label": "Public navigation" },
                    React.createElement(Button, { variant: "ghost", onClick: () => scrollPublicSection('start') }, "What it is"),
                    React.createElement(Button, { variant: "ghost", onClick: () => scrollPublicSection('explore') }, "What you can explore"),
                    React.createElement(Button, { variant: "ghost", onClick: () => scrollPublicSection('hardware') }, "Engineering"),
                    React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('guest') }, "Guest Mode"),
                    React.createElement(Button, { variant: "primary", onClick: onPrivate },
                        React.createElement(Icon, { name: "lock-keyhole" }),
                        " Private Dashboard")),
                React.createElement("button", { className: "grid h-11 w-11 place-items-center rounded-xl border border-line text-warm md:hidden", onClick: () => setMobile(!mobile), "aria-expanded": mobile, "aria-label": "Open navigation" },
                    React.createElement(Icon, { name: mobile ? 'x' : 'menu' }))),
            mobile && React.createElement("nav", { className: "border-t border-line bg-panel px-4 py-3 md:hidden", "aria-label": "Mobile public navigation" },
                React.createElement("div", { className: "grid gap-2" },
                    React.createElement(Button, { variant: "ghost", onClick: () => { setMobile(false); scrollPublicSection('start'); } }, "What it is"),
                    React.createElement(Button, { variant: "ghost", onClick: () => { setMobile(false); scrollPublicSection('explore'); } }, "What you can explore"),
                    React.createElement(Button, { variant: "ghost", onClick: () => { setMobile(false); scrollPublicSection('hardware'); } }, "Engineering"),
                    React.createElement(Button, { variant: "ghost", onClick: () => { setMobile(false); pushRoute('guest'); } }, "Guest Mode"),
                    React.createElement(Button, { variant: "primary", onClick: () => { setMobile(false); onPrivate(); } }, "Private Dashboard"))));
    }
    function HeroVisual() {
        return React.createElement("figure", { className: "signal-figure", "aria-label": "Illustrative MOM signal acquisition monitor" },
            React.createElement("figcaption", { className: "instrument-header" },
                React.createElement("span", null, "WHAT MOM IS DOING / DEMO"),
                React.createElement("span", { className: "instrument-live" }, "● READY")),
            React.createElement("div", { className: "instrument-readout" },
                React.createElement("div", { className: "instrument-id" }, "LISTEN → CHECK → COMPARE"),
                React.createElement("p", { className: "instrument-caption" }, "The line below is an illustration of sound becoming data. It is not a medical result."),
                React.createElement("div", { className: "instrument-wave" }, React.createElement(Waveform, { compact: true, demo: true, label: "Illustrative abdominal-sound waveform" })),
                React.createElement("div", { className: "instrument-ledger" },
                    React.createElement("div", null, React.createElement("span", null, "LISTENING SPEED"), React.createElement("strong", null, "8,000 / sec")),
                    React.createElement("div", null, React.createElement("span", null, "REVIEW WINDOW"), React.createElement("strong", null, "0.5 sec")),
                    React.createElement("div", null, React.createElement("span", null, "QUALITY CHECK"), React.createElement("strong", null, "ON")))),
            React.createElement("div", { className: "instrument-chain" },
                ["LISTENS / stethoscope", "CAPTURES / microphone", "SENDS / ESP32", "CHECKS / software"].map((x, i) => React.createElement("span", { key: x }, `${String(i + 1).padStart(2, '0')} / ${x}`))));
    }
    function BeginnerGuide() {
        const steps = [
            ["01", "Listen", "A small microphone attached to a stethoscope picks up quiet sounds from the outside of the abdomen."],
            ["02", "Check", "The software checks whether the recording stayed steady, quiet, complete, and within the microphone’s usable range."],
            ["03", "Explore", "You can review sessions and optional check-ins over time. MOM shows uncertainty instead of inventing an answer."]
        ];
        return React.createElement("section", { id: "start", className: "beginner-section" },
            React.createElement("div", { className: "beginner-definition" },
                React.createElement("span", { className: "lab-kicker" }, "START HERE / PLAIN LANGUAGE"),
                React.createElement("h2", null, "Abdominal acoustics means listening to quiet sounds from the abdomen."),
                React.createElement("p", null, "MOM SenseLoop is a low-cost research prototype that turns those sounds into a recording you can inspect. It does not look inside the body, diagnose a condition, or know an objective hunger level.")),
            React.createElement("div", { className: "beginner-steps" }, steps.map(([n, title, copy]) => React.createElement("article", { key: n, className: "beginner-step" },
                React.createElement("span", null, n),
                React.createElement("div", null, React.createElement("h3", null, title), React.createElement("p", null, copy))))),
            React.createElement("div", { className: "trust-rail", "aria-label": "Why MOM is trustworthy" },
                React.createElement("strong", null, "Why trust the experience?"),
                ["Recording quality is checked before interpretation", "Weak evidence becomes “Not enough information”", "Private profiles stay separated", "Guest Mode uses demonstration data only"].map(x => React.createElement("span", { key: x }, React.createElement(Icon, { name: "check", size: 15 }), x))));
    }
    function ExploreModes({ onPrivate }) {
        return React.createElement("section", { id: "explore", className: "explore-section" },
            React.createElement("div", { className: "explore-heading" },
                React.createElement("span", { className: "lab-kicker" }, "CHOOSE YOUR DEPTH"),
                React.createElement("h2", null, "Explore without learning everything at once."),
                React.createElement("p", null, "Start with a safe demonstration, use your private workspace, or open the engineering record. Every route explains what you are seeing.")),
            React.createElement("div", { className: "explore-layout" },
                React.createElement("article", { className: "explore-primary" },
                    React.createElement("div", { className: "explore-number" }, "01"),
                    React.createElement(Badge, { tone: "demo" }, "No sign-in · Demo data"),
                    React.createElement("h3", null, "See the whole idea safely."),
                    React.createElement("p", null, "Guest Mode shows an example waveform, a plain-language quality review, the guided recording flow, uncertainty, and privacy boundaries. It never reads a real profile or live sensor."),
                    React.createElement(Button, { variant: "primary", onClick: () => pushRoute('guest') }, "Open Guest Mode", React.createElement(Icon, { name: "arrow-right" }))),
                React.createElement("div", { className: "explore-secondary" },
                    React.createElement("article", null,
                        React.createElement("div", { className: "explore-number" }, "02"),
                        React.createElement("h3", null, "Use your private workspace."),
                        React.createElement("p", null, "Sign in with Google to keep profiles, recordings, optional check-ins, preferences, and research history account-scoped."),
                        React.createElement(Button, { onClick: onPrivate }, React.createElement(Icon, { name: "lock-keyhole" }), "Private Dashboard")),
                    React.createElement("article", null,
                        React.createElement("div", { className: "explore-number" }, "03"),
                        React.createElement("h3", null, "Inspect the engineering."),
                        React.createElement("p", null, "Review the hardware path, signal checks, reproducibility controls, documented iterations, and project limitations."),
                        React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('how') }, "Open technical brief", React.createElement(Icon, { name: "arrow-right" }))))));
    }
    function EvidenceLedger() {
        const items = [
            ["~$19", "core prototype parts"],
            ["32+", "controlled tests"],
            ["8+", "technical reviewers"],
            ["V1 → V3", "documented iterations"]
        ];
        return React.createElement("section", { className: "evidence-ledger", "aria-label": "Project evidence summary" },
            items.map(([value, label]) => React.createElement("div", { key: label },
                React.createElement("strong", null, value),
                React.createElement("span", null, label))));
    }
    function HardwareEvolution() {
        const versions = [
            ["V1", "Capture feasibility", "Established that the low-cost ESP32 and MAX4466 chain could acquire abdominal-acoustic signals through a stethoscope-style interface."],
            ["V2", "Controlled validation", "Added contiguous acquisition, measured sample-rate checks, duplicate rejection, clipping checks, and source-separated playback evaluation."],
            ["V3", "SenseLoop platform", "Connects guided recording, quality gates, separated profiles, optional check-ins, privacy controls, and uncertainty-aware research summaries."]
        ];
        return React.createElement("section", { id: "hardware", className: "lab-section hardware-section" },
            React.createElement("div", { className: "lab-section__intro" },
                React.createElement("span", { className: "lab-kicker" }, "01 / HARDWARE EVOLUTION"),
                React.createElement("h2", null, "Three iterations. Every failure becomes a design input."),
                React.createElement("p", null, "The project is documented as an engineering research prototype: sensor placement, acoustic coupling, motion, noise, clipping, coverage, and reproducibility are treated as measurable constraints.")),
            React.createElement("div", { className: "version-timeline" }, versions.map(([v, title, copy], i) =>
                React.createElement("article", { key: v, className: "version-row" },
                    React.createElement("div", { className: "version-code" }, v),
                    React.createElement("div", { className: "version-index" }, `0${i + 1}`),
                    React.createElement("div", null, React.createElement("h3", null, title), React.createElement("p", null, copy))))));
    }
    function SignalPipeline() {
        const stages = [
            ["INPUT", "Stethoscope coupling", "fixed placement + contact"],
            ["ADC", "ESP32 / MAX4466", "8 kHz contiguous windows"],
            ["GATE", "Signal quality", "rate · clipping · motion · noise"],
            ["DSP", "Python analysis", "RMS · spectrum · entropy · bandwidth"],
            ["VIEW", "SenseLoop", "profile-specific research summary"]
        ];
        return React.createElement("section", { id: "pipeline", className: "lab-section pipeline-section" },
            React.createElement("div", { className: "lab-section__intro" },
                React.createElement("span", { className: "lab-kicker" }, "02 / SIGNAL PROCESSING"),
                React.createElement("h2", null, "A visible acquisition path, not a black box."),
                React.createElement("p", null, "Each step exposes its inputs, quality checks, and limits. The interface can abstain with “Not enough information” instead of forcing a prediction.")),
            React.createElement("div", { className: "pipeline-console" },
                React.createElement("div", { className: "console-top" }, React.createElement("span", null, "PIPELINE / MOM-SL-V3"), React.createElement("span", null, "RESEARCH MODE")),
                React.createElement("div", { className: "pipeline-stages" }, stages.map(([tag, title, meta], i) => React.createElement("div", { key: tag, className: "pipeline-stage" },
                    React.createElement("span", { className: "pipeline-tag" }, tag),
                    React.createElement("strong", null, title),
                    React.createElement("small", null, meta),
                    i < stages.length - 1 && React.createElement("i", { "aria-hidden": "true" }, "→"))))));
    }
    function ValidationProgram() {
        const rows = [
            ["Acquisition integrity", "sample rate / clipping / window coverage", "automatic rejection"],
            ["Physical setup", "placement / coupling / gain / motion", "controlled protocol"],
            ["Data integrity", "duplicates / corruption / split leakage", "hash + source checks"],
            ["Model evaluation", "held-out sources / balanced metrics", "no test-phase tuning"],
            ["Human review", "8+ technical reviewers", "feedback integrated"]
        ];
        return React.createElement("section", { id: "validation", className: "lab-section validation-section" },
            React.createElement("div", { className: "validation-aside" },
                React.createElement("span", { className: "lab-kicker" }, "03 / EMPIRICAL RIGOR"),
                React.createElement("strong", null, "32+"),
                React.createElement("p", null, "controlled engineering tests across the device, acquisition path, data preparation, and evaluation workflow.")),
            React.createElement("div", { className: "validation-table" },
                React.createElement("div", { className: "validation-head" }, React.createElement("span", null, "CONTROL"), React.createElement("span", null, "OBSERVED"), React.createElement("span", null, "RULE")),
                rows.map(([a, b, c]) => React.createElement("div", { key: a, className: "validation-row" }, React.createElement("strong", null, a), React.createElement("span", null, b), React.createElement("code", null, c)))));
    }
    function PublicHome({ onPrivate }) {
        return React.createElement(React.Fragment, null,
            React.createElement(PublicNav, { onPrivate: onPrivate }),
            React.createElement("main", { id: "main-content" },
                React.createElement("section", { className: "public-hero" },
                    React.createElement("div", null,
                        React.createElement("div", { className: "hero-overline" }, "MOM SENSELOOP V3 / ABDOMINAL-SOUND RESEARCH"),
                        React.createElement("h1", { className: "mt-6 text-5xl font-black leading-[.96] tracking-[-0.06em] text-warm sm:text-6xl lg:text-7xl" },
                            "Your abdomen makes quiet sounds.",
                            React.createElement("br", null),
                            React.createElement("span", { className: "text-mint2" }, "MOM helps record them clearly.")),
                        React.createElement("p", { className: "mt-6 max-w-2xl text-lg leading-8 text-slate2" }, "MOM SenseLoop is a low-cost research device that uses a stethoscope-mounted microphone to record sound from the abdomen. The software checks recording quality, then helps you explore sessions and optional check-ins over time—without diagnosing or pretending certainty."),
                        React.createElement("div", { className: "mt-7 flex flex-wrap gap-3" },
                            React.createElement(Button, { variant: "primary", onClick: () => pushRoute('guest') },
                                React.createElement(Icon, { name: "sparkles" }),
                                " Try the safe demo"),
                            React.createElement(Button, { onClick: () => scrollPublicSection('start') },
                                React.createElement(Icon, { name: "play-circle" }),
                                " See how it works"),
                            React.createElement(Button, { variant: "ghost", onClick: onPrivate },
                                React.createElement(Icon, { name: "lock-keyhole" }),
                                " Private Dashboard")),
                        React.createElement("div", { className: "mt-7 flex max-w-2xl gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-4 text-sm leading-6 text-[#62B5A6]" },
                            React.createElement(Icon, { name: "shield-check" }),
                            React.createElement("span", null,
                                React.createElement("strong", null, "Research prototype—not a medical device."),
                                " MOM does not diagnose conditions, measure a true hunger level, read thoughts, or make medical or food decisions."))),
                    React.createElement(HeroVisual, null)),
                React.createElement(BeginnerGuide, null),
                React.createElement(ExploreModes, { onPrivate: onPrivate }),
                React.createElement(EvidenceLedger, null),
                React.createElement(HardwareEvolution, null),
                React.createElement(SignalPipeline, null),
                React.createElement(ValidationProgram, null),
                React.createElement("section", { className: "mx-auto max-w-[1180px] px-4 py-16 sm:px-6" },
                    React.createElement(SectionTitle, { kicker: "SenseLoop software", title: "A careful interface on top of measurable engineering" }),
                    React.createElement("div", { className: "feature-index" }, [
                        ['route', 'Guided recording', 'Capture a short session with step-by-step support.'],
                        ['activity', 'Signal-quality review', 'See whether the recording is steady, clear, and usable.'],
                        ['users-round', 'Profile-separated history', 'Each person’s recordings and optional check-ins remain separate.'],
                        ['circle-help', 'Honest summaries', 'MOM only shows supported experimental views and abstains when information is insufficient.'],
                        ['settings', 'Voluntary preferences', 'Craving and food-category preferences are optional, editable, and never treated as physiological facts.'],
                        ['arrow-right', 'Optional food-app handoff', 'MOM may open a user-selected food service after confirmation. It never purchases or places an order.']
                    ].map(([icon, title, copy]) => React.createElement(Card, { key: title },
                        React.createElement("div", { className: "mb-4 text-mint2" },
                            React.createElement(Icon, { name: icon })),
                        React.createElement("h3", { className: "font-black text-warm" }, title),
                        React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, copy))))),
                React.createElement("section", { className: "mx-auto max-w-[1180px] px-4 pb-20 sm:px-6" },
                    React.createElement("div", { className: "principles-split" },
                        React.createElement(Card, null,
                            React.createElement("div", { className: "flex items-start gap-4" },
                                React.createElement("div", { className: "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint/10 text-mint2" },
                                    React.createElement(Icon, { name: "lock-keyhole" })),
                                React.createElement("div", null,
                                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Privacy by design"),
                                    React.createElement("p", { className: "mt-2 text-slate2" }, "Guest Mode never reads private profiles. Signed-in profiles, sessions, check-ins, preferences, devices, and device credentials are protected by account-scoped database rules."),
                                    React.createElement(Button, { className: "mt-4", variant: "ghost", onClick: () => pushRoute('guest') },
                                        "Explore Guest Mode ",
                                        React.createElement(Icon, { name: "arrow-right" }))))),
                        React.createElement(Card, null,
                            React.createElement("div", { className: "flex items-start gap-4" },
                                React.createElement("div", { className: "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber/10 text-[#62B5A6]" },
                                    React.createElement(Icon, { name: "scale" })),
                                React.createElement("div", null,
                                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Experimental pattern summary, not a medical conclusion."),
                                    React.createElement("p", { className: "mt-2 text-slate2" }, "MOM does not diagnose disease, determine medical safety, prescribe nutrition, or claim to know an objective \u201Ctrue hunger\u201D value."),
                                    React.createElement(Button, { className: "mt-4", variant: "ghost", onClick: () => pushRoute('how') },
                                        "Read the limits ",
                                        React.createElement(Icon, { name: "arrow-right" })))))))),
            React.createElement(Footer, null));
    }
    function HowWorks({ onPrivate }) {
        const terms = [
            ['Acoustic coupling', 'The stethoscope-style interface helps transmit sound to the microphone.'],
            ['Clipping', 'The signal exceeded the recording range, which can distort captured audio.'],
            ['Contact consistency', 'How steadily the sensor remained against the selected recording position.'],
            ['Experimental summary', 'A research view based on available data, not a medical conclusion.']
        ];
        return React.createElement(React.Fragment, null,
            React.createElement(PublicNav, { onPrivate: onPrivate }),
            React.createElement("main", { id: "main-content", className: "mx-auto max-w-[1180px] px-4 py-14 sm:px-6" },
                React.createElement("button", { onClick: () => pushRoute('home'), className: "mb-8 inline-flex items-center gap-2 rounded-xl text-sm font-bold text-slate2 hover:text-warm focus-visible:ring-2 focus-visible:ring-mint" },
                    React.createElement(Icon, { name: "arrow-left" }),
                    " Public home"),
                React.createElement(SectionTitle, { kicker: "How MOM works / simple first, technical second", title: "A quiet sound becomes a checked recording—not a medical answer.", copy: "Start with the four plain-language steps below. The hardware specifications, processing path, and reproducibility controls follow for anyone who wants the deeper engineering view." }),
                React.createElement("div", { className: "grid gap-4 lg:grid-cols-4" }, [
                    ['1', 'Capture sound', 'The ESP32 + MAX4466 sensor uses stethoscope-based acoustic coupling to capture a short abdominal recording.', 'mic-2'],
                    ['2', 'Check the signal', 'The system reviews clarity, movement, contact consistency, background noise, clipping, and completion.', 'scan-line'],
                    ['3', 'Keep profiles separate', 'Each profile has its own recordings, optional check-ins, preferences, and research history.', 'users-round'],
                    ['4', 'Show only supported summaries', 'MOM presents an experimental view only when the available data supports it. Otherwise: “Not enough information.”', 'shield-question']
                ].map(([n, title, copy, icon]) => React.createElement(Card, { key: n },
                    React.createElement("div", { className: "flex items-center justify-between" },
                        React.createElement("span", { className: "grid h-9 w-9 place-items-center rounded-full bg-mint/10 font-black text-mint2" }, n),
                        React.createElement("span", { className: "text-mint2" },
                            React.createElement(Icon, { name: icon }))),
                    React.createElement("h3", { className: "mt-5 text-lg font-black text-warm" }, title),
                    React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, copy)))),
                React.createElement(Card, { className: "mt-6 overflow-hidden" },
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Device and data flow"),
                    React.createElement("div", { className: "mt-5 flex flex-col items-stretch gap-2 md:flex-row md:items-center" }, ['Stethoscope coupling', 'MAX4466 microphone', 'ESP32', 'Quality gate', 'Python DSP', 'Profile history', 'Experimental view'].map((x, i) => React.createElement(React.Fragment, { key: x },
                        React.createElement("div", { className: "flex-1 rounded-xl border border-line bg-bg/60 px-3 py-3 text-center text-sm font-bold text-slate2" }, x),
                        i < 6 && React.createElement("div", { className: "grid place-items-center text-mint2" },
                            React.createElement(Icon, { name: window.innerWidth < 768 ? 'arrow-down' : 'arrow-right' })))))),
                React.createElement("div", { className: "mt-6 grid gap-4 lg:grid-cols-2" },
                    React.createElement(Card, null,
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Reference hardware and software"),
                        React.createElement("div", { className: "mt-4 divide-y divide-line" }, [
                            ['Sensor', 'MAX4466 electret microphone amplifier'],
                            ['Controller', 'ESP32 acquisition and network transport'],
                            ['Coupling', 'Stethoscope-style acoustic interface'],
                            ['Acquisition', '8 kHz contiguous 4096-sample windows'],
                            ['Analysis', 'Python quality checks and frequency-aware DSP'],
                            ['Cost target', 'Approximately \$19 for the core research prototype']
                        ].map(([term, copy]) => React.createElement("div", { key: term, className: "grid grid-cols-[120px_1fr] gap-4 py-3 text-sm" },
                            React.createElement("strong", { className: "font-mono text-mint2" }, term),
                            React.createElement("span", { className: "text-slate2" }, copy))))),
                    React.createElement(Card, null,
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Reproducibility controls"),
                        React.createElement("ul", { className: "mt-4 space-y-3 text-sm text-slate2" }, [
                            'Measured sample-rate and clipping rejection',
                            'Continuous-window coverage checks',
                            'SHA-256 duplicate detection',
                            'Source-separated calibration and evaluation',
                            'Untouched test phase with no tuning',
                            'Versioned logs, figures, metrics, and reports'
                        ].map(x => React.createElement("li", { key: x, className: "flex gap-3" }, React.createElement(Icon, { name: "check", size: 16, className: "text-mint2" }), React.createElement("span", null, x))))),
                    React.createElement(Card, null,
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Technical terms, translated"),
                        React.createElement("div", { className: "mt-4 divide-y divide-line" }, terms.map(([term, copy]) => React.createElement("details", { key: term, className: "py-3" },
                            React.createElement("summary", { className: "cursor-pointer font-bold text-warm focus-visible:ring-2 focus-visible:ring-mint" }, term),
                            React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, copy))))),
                    React.createElement(Card, null,
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "What MOM can and cannot conclude"),
                        React.createElement("div", { className: "mt-4 grid gap-3" },
                            React.createElement("div", { className: "rounded-xl border border-mint/25 bg-mint/5 p-4" },
                                React.createElement("strong", { className: "text-mint2" }, "Can show"),
                                React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "Recording-quality observations, profile history, optional self-reports, acoustic research outputs, time-based baselines, and supported profile-specific model outputs.")),
                            React.createElement("div", { className: "rounded-xl border border-amber/25 bg-amber/5 p-4" },
                                React.createElement("strong", { className: "text-[#62B5A6]" }, "Does not claim"),
                                React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "Diagnosis, treatment, medical safety, disease detection, a digestive-health score, objective hunger measurement, nutritional prescriptions, or mind-reading."))))),
                React.createElement("div", { className: "mt-8 flex flex-wrap gap-3" },
                    React.createElement(Button, { variant: "primary", onClick: () => pushRoute('guest') }, "Explore Guest Mode"),
                    React.createElement(Button, { onClick: onPrivate }, "Start a guided recording"))),
            React.createElement(Footer, null));
    }
    function GuestMode({ onPrivate }) {
        const [demoTab, setDemoTab] = useState('overview');
        return React.createElement(React.Fragment, null,
            React.createElement(PublicNav, { onPrivate: onPrivate }),
            React.createElement("main", { id: "main-content", className: "mx-auto max-w-[1180px] px-4 py-14 sm:px-6" },
                React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-4" },
                    React.createElement("div", null,
                        React.createElement(Badge, { tone: "demo" }, "Guest Mode \u00B7 Demo data"),
                        React.createElement("h1", { className: "mt-5 text-4xl font-black tracking-[-.05em] text-warm sm:text-5xl" }, "Explore MOM SenseLoop safely."),
                        React.createElement("p", { className: "mt-4 max-w-3xl text-lg leading-8 text-slate2" }, "Guest Mode uses non-personal demonstration content so visitors can learn how MOM works without accessing private recordings, profiles, live device data, check-ins, preferences, or personalized research outputs."))),
                React.createElement("nav", { className: "mt-8 flex flex-wrap gap-2", "aria-label": "Guest Mode sections" }, ['overview', 'recording', 'insights', 'privacy'].map(t => React.createElement(Button, { key: t, variant: demoTab === t ? 'primary' : 'secondary', onClick: () => setDemoTab(t) }, t[0].toUpperCase() + t.slice(1)))),
                React.createElement("div", { className: "mt-6" },
                    demoTab === 'overview' && React.createElement("div", { className: "grid gap-4 lg:grid-cols-2" },
                        React.createElement(Card, null,
                            React.createElement("div", { className: "flex items-center justify-between" },
                                React.createElement("h2", { className: "text-2xl font-black text-warm" }, "Demo recording"),
                                React.createElement(Badge, { tone: "demo" }, "Demo data")),
                            React.createElement("p", { className: "mt-2 text-slate2" }, "This waveform is fabricated demonstration content. It is not a real person\u2019s recording."),
                            React.createElement("div", { className: "mt-5" },
                                React.createElement(Waveform, { demo: true, label: "Example abdominal-acoustic waveform" }))),
                        React.createElement(Card, null,
                            React.createElement("div", { className: "flex items-center justify-between" },
                                React.createElement("h2", { className: "text-2xl font-black text-warm" }, "Example quality review"),
                                React.createElement(Badge, { tone: "demo" }, "Demo data")),
                            React.createElement("div", { className: "mt-5 space-y-1" }, Object.entries(MOM.demoScenario.sessions[0].qualityMetrics).filter(([k]) => k !== 'guidance').map(([k, v]) => React.createElement("div", { key: k, className: "flex items-center justify-between gap-4 border-b border-line py-3" },
                                React.createElement("span", { className: "text-sm text-slate2" }, k.replace(/([A-Z])/g, ' $1').replace(/^./, m => m.toUpperCase())),
                                React.createElement("strong", { className: "text-sm text-mint2" }, metricLabel(v)))))),
                        React.createElement(Card, { className: "lg:col-span-2" },
                            React.createElement("div", { className: "flex items-center justify-between gap-4" },
                                React.createElement("div", null,
                                    React.createElement("h2", { className: "text-2xl font-black text-warm" }, "Experimental summary"),
                                    React.createElement("p", { className: "mt-2 text-slate2" }, "Guest Mode intentionally demonstrates uncertainty instead of pretending to know a personal result.")),
                                React.createElement(Badge, { tone: "demo" }, "Demo data")),
                            React.createElement("div", { className: "mt-5 rounded-2xl border-l-4 border-amber bg-amber/10 p-5" },
                                React.createElement("strong", { className: "text-xl text-warm" }, "Not enough information."),
                                React.createElement("p", { className: "mt-2 text-slate2" }, "MOM chooses not to force a result when model support is weak or conflicting.")))),
                    demoTab === 'recording' && React.createElement(Card, null,
                        React.createElement("div", { className: "flex items-center justify-between" },
                            React.createElement(SectionTitle, { kicker: "Demo recording flow", title: "Prepare \u2192 Quality check \u2192 Record \u2192 Review \u2192 Optional check-in" }),
                            React.createElement(Badge, { tone: "demo" }, "Demo data")),
                        React.createElement("div", { className: "grid gap-3 md:grid-cols-5" }, ['Prepare', 'Quality check', 'Record', 'Review', 'Check-in'].map((x, i) => React.createElement("div", { key: x, className: "rounded-2xl border border-line bg-bg/50 p-4" },
                            React.createElement("span", { className: "text-xs font-black uppercase tracking-wider text-mint2" },
                                "Step ",
                                i + 1),
                            React.createElement("h3", { className: "mt-2 font-black text-warm" }, x),
                            React.createElement("p", { className: "mt-2 text-sm text-slate2" }, ['Find a quiet space and keep the sensor steady.', 'MOM checks connection and recording-quality signals.', 'A clear timer and waveform keep the process focused.', 'Quality is explained in plain language before learning eligibility.', 'The user can answer, skip, or prefer not to say.'][i]))))),
                    demoTab === 'insights' && React.createElement("div", { className: "grid gap-4 md:grid-cols-3" },
                        React.createElement(Card, { className: "md:col-span-3" },
                            React.createElement("h3", { className: "text-xl font-black text-warm" }, "Personalized insights are unavailable in Guest Mode"),
                            React.createElement("p", { className: "mt-2 text-slate2" }, "Guest Mode uses demonstration content and does not access personal recordings or profiles. Not enough information is shown as a deliberate privacy and uncertainty state.")),
                        React.createElement(Card, null,
                            React.createElement("div", { className: "text-sm text-slate2" }, "Total recordings"),
                            React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, "14"),
                            React.createElement(Badge, { tone: "demo" }, "Demo data")),
                        React.createElement(Card, null,
                            React.createElement("div", { className: "text-sm text-slate2" }, "Usable recordings"),
                            React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, "10"),
                            React.createElement(Badge, { tone: "demo" }, "Demo data")),
                        React.createElement(Card, null,
                            React.createElement("div", { className: "text-sm text-slate2" }, "Optional check-ins"),
                            React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, "7"),
                            React.createElement(Badge, { tone: "demo" }, "Demo data")),
                        React.createElement(Card, { className: "md:col-span-3" },
                            React.createElement("h3", { className: "text-xl font-black text-warm" }, "Growing history, not proof"),
                            React.createElement("p", { className: "mt-2 text-slate2" }, "Counts describe the demo dataset. They do not prove a physiological relationship, medical condition, or causal effect."))),
                    demoTab === 'privacy' && React.createElement("div", { className: "grid gap-4 lg:grid-cols-2" },
                        React.createElement(Card, null,
                            React.createElement("h2", { className: "text-2xl font-black text-warm" }, "Guest Mode cannot access"),
                            React.createElement("ul", { className: "mt-4 space-y-3 text-slate2" }, ['Real profile names', 'Live sensor feeds', 'Private recordings', 'Personal check-ins', 'Saved food preferences', 'Personalized research outputs'].map(x => React.createElement("li", { key: x, className: "flex gap-3" },
                                React.createElement(Icon, { name: "lock-keyhole" }),
                                React.createElement("span", null, x))))),
                        React.createElement(Card, null,
                            React.createElement("h2", { className: "text-2xl font-black text-warm" }, "Profile separation"),
                            React.createElement("div", { className: "mt-4 grid grid-cols-2 gap-3" },
                                React.createElement("div", { className: "rounded-2xl border border-line bg-bg/50 p-4" },
                                    React.createElement("strong", { className: "text-mint2" }, "Profile A"),
                                    React.createElement("p", { className: "mt-2 text-sm text-slate2" },
                                        "its recordings",
                                        React.createElement("br", null),
                                        "its check-ins",
                                        React.createElement("br", null),
                                        "its preferences",
                                        React.createElement("br", null),
                                        "its research history")),
                                React.createElement("div", { className: "rounded-2xl border border-line bg-bg/50 p-4" },
                                    React.createElement("strong", { className: "text-mint2" }, "Profile B"),
                                    React.createElement("p", { className: "mt-2 text-sm text-slate2" },
                                        "its recordings",
                                        React.createElement("br", null),
                                        "its check-ins",
                                        React.createElement("br", null),
                                        "its preferences",
                                        React.createElement("br", null),
                                        "its research history"))),
                            React.createElement("p", { className: "mt-4 font-bold text-warm" }, "No data is mixed across profiles.")))),
                React.createElement("div", { className: "mt-8 flex flex-wrap gap-3" },
                    React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('home') }, "Exit Guest Mode"),
                    React.createElement(Button, { onClick: () => pushRoute('how') }, "How MOM works"),
                    React.createElement(Button, { variant: "primary", onClick: onPrivate }, "Create or select a profile"))),
            React.createElement(Footer, null));
    }
    function AuthScreen({ cloud, onBack }) {
        const [message, setMessage] = useState('');
        const [checking, setChecking] = useState(false);
        const signIn = async () => {
            setChecking(true);
            setMessage('Checking secure Google sign-in…');
            const result = await cloud.signInWithGoogle();
            if (result.error) {
                setMessage(result.error);
                setChecking(false);
            }
        };
        return React.createElement(React.Fragment, null,
            React.createElement(PublicNav, { onPrivate: () => { } }),
            React.createElement("main", { id: "main-content", className: "mx-auto grid min-h-[calc(100vh-72px)] max-w-[1180px] place-items-center px-4 py-12 sm:px-6" },
                React.createElement(Card, { className: "w-full max-w-xl text-center" },
                    React.createElement("div", { className: "mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/10 text-mint2" },
                        React.createElement(Icon, { name: "lock-keyhole" })),
                    React.createElement(Badge, { tone: "neutral" },
                        React.createElement("span", { className: "inline-flex items-center gap-2" },
                            React.createElement(Icon, { name: "shield-check", size: 14 }),
                            " Private Dashboard")),
                    React.createElement("h1", { className: "mt-5 text-4xl font-black tracking-[-.05em] text-warm" }, "Sign in with Google."),
                    React.createElement("p", { className: "mx-auto mt-3 max-w-lg text-slate2" }, "Your Google-authenticated MOM account keeps private profiles and research history separate from other users."),
                    React.createElement("div", { className: "mt-7" },
                        React.createElement(Button, { variant: "google", className: "w-full", disabled: checking, onClick: signIn },
                            React.createElement("span", { className: "text-lg font-black text-[#62B5A6]" }, "G"),
                            " ",
                            checking ? 'Checking Google sign-in…' : 'Continue with Google')),
                    React.createElement("div", { className: "mt-4 min-h-6 text-sm text-amber", "aria-live": "polite" }, message),
                    React.createElement("div", { className: "my-6 h-px bg-line" }),
                    React.createElement(Button, { variant: "ghost", onClick: onBack }, "Back to public homepage"))),
            React.createElement(Footer, null));
    }
    function DevicePill({ devices, demo = false }) {
        const online = demo || isOnline(devices);
        return React.createElement("div", { className: `inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${online ? 'border-mint/30 bg-mint/10 text-mint2' : 'border-amber/30 bg-amber/10 text-[#62B5A6]'}` },
            React.createElement("span", { className: `h-2.5 w-2.5 rounded-full ${online ? 'bg-mint' : 'bg-amber'}` }),
            demo ? 'Demo data' : online ? 'Device connected' : 'Device offline');
    }
    function DashboardNav({ tab, setTab, onPublic, onSignOut }) {
        const [mobile, setMobile] = useState(false);
        return React.createElement(React.Fragment, null,
            React.createElement("header", { className: "sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-xl" },
                React.createElement("div", { className: "mx-auto flex min-h-[72px] max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6" },
                    React.createElement(Logo, null),
                    React.createElement("div", { className: "hidden items-center gap-2 lg:flex" },
                        React.createElement(Button, { variant: "ghost", onClick: onPublic }, "Public Home"),
                        React.createElement(Button, { ariaLabel: "Device settings", variant: "ghost", onClick: () => setTab('device') },
                            React.createElement(Icon, { name: "settings" }),
                            " Settings"),
                        React.createElement(Button, { variant: "secondary", onClick: onSignOut },
                            React.createElement(Icon, { name: "log-out" }),
                            " Sign out")),
                    React.createElement("button", { className: "grid h-11 w-11 place-items-center rounded-xl border border-line lg:hidden", onClick: () => setMobile(!mobile), "aria-expanded": mobile, "aria-label": "Open private navigation" },
                        React.createElement(Icon, { name: mobile ? 'x' : 'menu' }))),
                mobile && React.createElement("div", { className: "border-t border-line px-4 py-3 lg:hidden" },
                    React.createElement("div", { className: "grid grid-cols-2 gap-2" },
                        dashTabs.map(x => React.createElement(Button, { key: x.id, variant: tab === x.id ? 'primary' : 'secondary', onClick: () => { setTab(x.id); setMobile(false); } }, x.label)),
                        React.createElement(Button, { variant: "ghost", onClick: onPublic }, "Public Home"),
                        React.createElement(Button, { variant: "ghost", onClick: onSignOut }, "Sign out")))),
            React.createElement("nav", { className: "mx-auto hidden max-w-[1280px] gap-2 px-4 pt-5 lg:flex sm:px-6", "aria-label": "Private dashboard sections" }, dashTabs.map(x => React.createElement("button", { key: x.id, onClick: () => setTab(x.id), className: `inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint ${tab === x.id ? 'border-mint/45 bg-mint/10 text-mint2' : 'border-line bg-transparent text-slate2 hover:bg-white/5 hover:text-warm'}` },
                React.createElement(Icon, { name: x.icon, size: 16 }),
                x.label))));
    }
    function ProfileBar({ profiles, current, onSwitch, newName, setNewName, createProfile, devices }) {
        return React.createElement(Card, { className: "mb-5 mt-5" },
            React.createElement("div", { className: "grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end" },
                React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                    "Current profile",
                    React.createElement("select", { value: current?.id ?? '', onChange: e => onSwitch(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3 text-warm focus-visible:ring-2 focus-visible:ring-mint" },
                        React.createElement("option", { value: "" }, "Choose a profile"),
                        profiles.map(p => React.createElement("option", { key: p.id, value: p.id }, p.display_name)))),
                React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                    "Create new profile",
                    React.createElement("input", { value: newName, maxLength: 80, onChange: e => setNewName(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3 text-warm placeholder:text-slate focus-visible:ring-2 focus-visible:ring-mint", placeholder: "Profile name" })),
                React.createElement(Button, { onClick: createProfile }, "Create profile"),
                React.createElement(DevicePill, { devices: devices })));
    }
    function SummaryCard({ summary, onRecord, onInsights }) {
        const border = summary.status === 'available' ? 'border-mint' : summary.status === 'review' ? 'border-coral' : 'border-amber';
        const bg = summary.status === 'available' ? 'bg-mint/5' : summary.status === 'review' ? 'bg-coral/5' : 'bg-amber/5';
        const modelLabel = summary.modelType === 'personal' ? 'Personalized research model' : summary.modelType === 'sound' ? 'Sound-only research view' : summary.modelType === 'time' ? 'Time-based baseline' : null;
        return React.createElement(Card, null,
            React.createElement("div", { className: "flex flex-wrap items-start justify-between gap-3" },
                React.createElement("div", null,
                    React.createElement("div", { className: "text-xs font-black uppercase tracking-[.16em] text-mint2" }, "Current research summary"),
                    React.createElement("h3", { className: "mt-2 text-2xl font-black tracking-tight text-warm" }, summary.title)),
                summary.evidenceLevel && React.createElement(Badge, { tone: summary.status === 'available' ? 'good' : 'warn' }, summary.evidenceLevel)),
            React.createElement("div", { className: `mt-4 rounded-2xl border-l-4 ${border} ${bg} p-4` },
                modelLabel && React.createElement("div", { className: "mb-2 text-sm font-black text-warm" }, modelLabel),
                summary.estimate !== undefined && React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "text-sm font-bold text-slate2" }, "Estimated self-reported hunger based on your past patterns."),
                    React.createElement("div", { className: "mt-1 text-4xl font-black text-warm" },
                        summary.estimate.toFixed(1),
                        React.createElement("span", { className: "text-lg text-slate2" }, " / 10"))),
                React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, summary.supportText),
                React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, summary.explanation)),
            React.createElement("div", { className: "mt-4 flex flex-wrap gap-2" },
                React.createElement(Button, { variant: "primary", onClick: onRecord }, summary.status === 'review' ? 'Try another recording' : 'Record a session'),
                React.createElement(Button, { variant: "ghost", onClick: onInsights }, "Why am I seeing this?")));
    }
    function DashboardHome({ profile, sessions, checkins, devices, preferences, setTab }) {
        const online = isOnline(devices), usable = usableSessions(sessions), summary = summaryFor(sessions, checkins), recent = sessions.slice(0, 5), latest = latestSession(sessions);
        const prefEnabled = Boolean(preferences?.categories?.length || Object.values(preferences?.constraints ?? {}).some(Boolean));
        if (!profile)
            return React.createElement(EmptyState, { icon: "user-round-plus", title: "Choose or create a profile", copy: "A profile keeps recordings, optional check-ins, preferences, and research history separated from other people who may share the device." });
        return React.createElement("div", { className: "space-y-5" },
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-[1.35fr_.65fr]" },
                React.createElement(Card, { className: "relative overflow-hidden" },
                    React.createElement("div", { className: "absolute -right-16 -top-16 h-48 w-48 rounded-full bg-mint/5 hidden" }),
                    React.createElement("div", { className: "relative" },
                        React.createElement("div", { className: "text-xs font-black uppercase tracking-[.16em] text-mint2" }, "Next step"),
                        React.createElement("h1", { className: "mt-3 text-4xl font-black tracking-[-.05em] text-warm" }, online ? 'Ready to capture a new session?' : 'Connect the MOM device to begin'),
                        React.createElement("p", { className: "mt-3 max-w-2xl text-slate2" }, online ? React.createElement(React.Fragment, null,
                            "Record a short abdominal-sound session, review whether it was clear enough to use, and build ",
                            profile.display_name,
                            "\u2019s profile-separated research history.") : React.createElement(React.Fragment, null, "Not enough information for a current recording while the device is offline. Once your ESP32-based sensor reconnects, you can begin a guided recording. Your saved history remains available.")),
                        React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                            online ? React.createElement(Button, { variant: "primary", onClick: () => setTab('record') },
                                React.createElement(Icon, { name: "mic-2" }),
                                " Start guided recording") : React.createElement(Button, { variant: "primary", onClick: () => setTab('device') },
                                React.createElement(Icon, { name: "radio-tower" }),
                                " Connect MOM device"),
                            React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('how') }, "How MOM works"),
                            !online && React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('guest') }, "Explore demo")),
                        React.createElement("div", { className: "mt-5 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 rounded-2xl border border-line bg-bg/45 p-4 text-xs font-extrabold text-slate2", "aria-label": "MOM signal flow: sensor capture, quality review, profile history" },
                            React.createElement("span", { className: "grid h-9 w-9 place-items-center rounded-xl bg-mint/10 text-mint2" },
                                React.createElement(Icon, { name: "stethoscope", size: 17 })),
                            React.createElement("span", { className: "h-px editorial-flat-rule" }),
                            React.createElement("span", { className: "grid h-9 w-9 place-items-center rounded-xl bg-mint/10 text-mint2" },
                                React.createElement(Icon, { name: "scan-line", size: 17 })),
                            React.createElement("span", { className: "h-px editorial-flat-rule" }),
                            React.createElement("span", { className: "grid h-9 w-9 place-items-center rounded-xl bg-mint/10 text-mint2" },
                                React.createElement(Icon, { name: "layers-3", size: 17 }))),
                        React.createElement("div", { className: "mt-2 flex justify-between text-[11px] font-bold text-slate" },
                            React.createElement("span", null, "Capture"),
                            React.createElement("span", null, "Review"),
                            React.createElement("span", null, "Profile history")),
                        React.createElement("p", { className: "mt-5 text-sm font-bold text-slate2" }, "For research and personal exploration only."))),
                React.createElement(Card, null,
                    React.createElement("div", { className: "text-xs font-black uppercase tracking-[.16em] text-mint2" }, "Learning progress"),
                    React.createElement("div", { className: "mt-3 text-5xl font-black tracking-[-.06em] text-warm" }, usable.length),
                    React.createElement("p", { className: "font-bold text-slate2" }, "usable recordings"),
                    React.createElement("div", { className: "mt-4 h-2 overflow-hidden rounded-full bg-bg" },
                        React.createElement("div", { className: "h-full rounded-full bg-mint transition-all", style: { width: `${Math.min(100, (usable.length / 8) * 100)}%` } })),
                    React.createElement("p", { className: "mt-3 text-sm text-slate2" },
                        evidenceLevel(usable.length),
                        " \u00B7 ",
                        checkins.length,
                        " optional check-in",
                        checkins.length === 1 ? '' : 's'))),
            React.createElement("div", { className: "dashboard-action-index" }, [
                ['route', 'Guided recording', 'Step-by-step capture and review.', 'record'],
                ['activity', 'Signal-quality review', 'Plain-language recording checks.', 'sessions'],
                ['users-round', 'Profile separation', 'Other profiles are not used here.', 'privacy'],
                ['circle-help', 'Honest summaries', 'MOM abstains when support is weak.', 'insights']
            ].map(([icon, title, copy, tab]) => React.createElement("button", { key: title, onClick: () => setTab(tab), className: "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-[22px]" },
                React.createElement(Card, { className: "h-full transition hover:border-mint/35" },
                    React.createElement("div", { className: "text-mint2" },
                        React.createElement(Icon, { name: icon })),
                    React.createElement("h3", { className: "mt-4 font-black text-warm" }, title),
                    React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, copy))))),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-2" },
                React.createElement(SummaryCard, { summary: summary, onRecord: () => setTab('record'), onInsights: () => setTab('insights') }),
                React.createElement(Card, null,
                    React.createElement("div", { className: "flex items-center justify-between gap-4" },
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Your recent activity"),
                        React.createElement(Button, { variant: "ghost", onClick: () => setTab('sessions') }, "View all sessions")),
                    recent.length ? React.createElement("div", { className: "mt-3 divide-y divide-line" }, recent.map(s => { const ci = checkins.find(c => c.session_id === s.id); const wave = Array.isArray(s.acoustic_summary?.waveform) ? s.acoustic_summary.waveform : null; return React.createElement("button", { key: s.id, onClick: () => setTab('sessions'), className: "grid min-h-[78px] w-full grid-cols-[72px_1fr_auto] items-center gap-3 py-3 text-left hover:bg-white/[.02] focus-visible:ring-2 focus-visible:ring-mint" },
                        React.createElement("div", null, wave ? React.createElement(Waveform, { compact: true, values: wave, label: "Stored waveform thumbnail" }) : React.createElement("div", { className: "grid h-12 place-items-center rounded-xl border border-dashed border-line bg-bg/45 text-slate", "aria-label": "No waveform stored for this session" },
                            React.createElement(Icon, { name: "audio-waveform", size: 16 }))),
                        React.createElement("div", null,
                            React.createElement("div", { className: "font-bold text-warm" }, fmt(s.started_at)),
                            React.createElement("div", { className: "mt-1 text-xs text-slate2" },
                                s.duration_seconds ?? '—',
                                " sec \u00B7 ",
                                ci ? 'Optional check-in added' : 'No check-in')),
                        React.createElement(Badge, { tone: qualityTone(s.quality_label) }, qualityName(s.quality_label))); })) : React.createElement("div", { className: "mt-4" },
                        React.createElement(EmptyState, { title: "No recordings yet", copy: "Start with a guided recording when the paired device is online." })))),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-2" },
                React.createElement(Card, null,
                    React.createElement("div", { className: "flex items-center justify-between gap-3" },
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Latest signal-quality review"),
                        latest && React.createElement(Badge, { tone: qualityTone(latest.quality_label) }, qualityName(latest.quality_label))),
                    latest ? React.createElement("div", { className: "mt-4" },
                        qualityMetricRows(latest).map(row => { const value = row.value.toLowerCase(); const width = value.includes('good') || value.includes('low') || value.includes('complete') || value.includes('none') ? '88%' : value.includes('fair') || value.includes('within') ? '64%' : value.includes('limited') || value.includes('elevated') || value.includes('detected') ? '42%' : '28%'; return React.createElement("div", { key: row.label, className: "border-b border-line py-3" },
                            React.createElement("div", { className: "flex items-center justify-between gap-4" },
                                React.createElement("span", { className: "text-sm text-slate2" }, row.label),
                                React.createElement("strong", { className: "text-sm text-warm" }, row.value)),
                            React.createElement("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-bg", "aria-hidden": "true" },
                                React.createElement("div", { className: "h-full rounded-full bg-mint/75", style: { width } })),
                            React.createElement("p", { className: "mt-1 text-xs leading-5 text-slate" }, row.help)); }),
                        React.createElement("p", { className: "mt-4 text-sm text-slate2" }, String(latest.quality_summary?.guidance ?? 'For a clearer recording, keep the sensor steady and reduce unnecessary background noise.')),
                        React.createElement(Button, { className: "mt-3", variant: "ghost", onClick: () => setTab('sessions') }, "How quality checks work")) : React.createElement("div", { className: "mt-4" },
                        React.createElement(EmptyState, { title: "No signal-quality review yet", copy: "Quality observations appear after a device session is uploaded." }))),
                React.createElement(Card, null,
                    React.createElement("div", { className: "flex items-start gap-4" },
                        React.createElement("div", { className: "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint/10 text-mint2" },
                            React.createElement(Icon, { name: "shield-check" })),
                        React.createElement("div", null,
                            React.createElement("h3", { className: "text-xl font-black text-warm" }, "Your privacy, by design"),
                            React.createElement("p", { className: "mt-2 text-slate2" }, "Recordings, check-ins, preferences, and experimental model history from other profiles are not used here."),
                            React.createElement("p", { className: "mt-3 text-sm font-bold text-warm" }, "You control this profile\u2019s data, including session export and deletion."),
                            React.createElement(Button, { className: "mt-3", variant: "ghost", onClick: () => setTab('privacy') }, "Manage privacy and profiles"))))),
            prefEnabled && React.createElement(Card, null,
                React.createElement("div", { className: "flex flex-wrap items-start justify-between gap-4" },
                    React.createElement("div", null,
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Optional preference-based ideas"),
                        React.createElement("p", { className: "mt-2 text-slate2" }, "Suggestions reflect selected categories and practical constraints, not medical or nutrition advice."),
                        React.createElement("div", { className: "mt-3 flex flex-wrap gap-2" }, [...(preferences?.categories ?? []), String(preferences?.constraints?.availableTime ?? ''), String(preferences?.constraints?.budgetRange ?? ''), String(preferences?.constraints?.deliveryPreference ?? '')].filter(Boolean).slice(0, 6).map(x => React.createElement(Badge, { key: x, tone: "neutral" }, x)))),
                    React.createElement(Button, { variant: "primary", onClick: () => setTab('preferences') }, "Explore suggestions"))));
    }
    function RecordingFlow({ user, profile, sessions, devices, refresh, saveCheckin, updateSession }) {
        const [step, setStep] = useState(0);
        const [seconds, setSeconds] = useState(60);
        const [started, setStarted] = useState(null);
        const [matched, setMatched] = useState(null);
        const [saving, setSaving] = useState(false);
        const [message, setMessage] = useState('');
        const [state, setState] = useState('Neutral');
        const [rating, setRating] = useState(5);
        const [shareRating, setShareRating] = useState(true);
        const [meal, setMeal] = useState('');
        const [sensorPosition, setSensorPosition] = useState('');
        const [note, setNote] = useState('');
        const [active, setActive] = useState(false);
        const [noisy, setNoisy] = useState(false);
        const [preferLess, setPreferLess] = useState(false);
        const online = isOnline(devices);
        useEffect(() => {
            if (step !== 2)
                return;
            if (seconds <= 0) {
                setStep(3);
                return;
            }
            const t = setInterval(() => setSeconds((s) => s - 1), 1000);
            return () => clearInterval(t);
        }, [step, seconds]);
        const begin = () => { if (!profile || !online)
            return; setStarted(new Date().toISOString()); setMatched(null); setSeconds(60); setStep(2); };
        const finish = () => { setStep(3); };
        const findUploaded = async () => {
            if (!started)
                return;
            setMessage('Checking for the uploaded device session…');
            const fresh = await refresh();
            const threshold = new Date(started).getTime() - 5000;
            const candidate = (fresh?.sessions ?? sessions).find(s => new Date(s.started_at).getTime() >= threshold) ?? null;
            setMatched(candidate);
            setMessage(candidate ? 'Uploaded device session matched to this recording window.' : 'No uploaded session has arrived yet. Nothing was silently saved.');
        };
        useEffect(() => { if (step === 3 && started) {
            const t = setTimeout(findUploaded, 500);
            return () => clearTimeout(t);
        } }, [step]);
        const submit = async () => {
            if (!profile)
                return;
            setSaving(true);
            setMessage('Saving optional check-in…');
            try {
                await saveCheckin({ owner_id: user.id, profile_id: profile.id, session_id: matched?.id ?? null, hunger_rating: shareRating ? rating : null, minutes_since_eating: meal ? Math.max(0, Math.min(10080, Math.round(Number(meal)))) : null, optional_context: { state, prefer_not_to_share_more: preferLess, active_recently: preferLess ? undefined : active, noisy_environment: preferLess ? undefined : noisy, sensor_position: preferLess ? undefined : (sensorPosition || undefined), note: preferLess ? undefined : (note || undefined) } });
                setMessage('Check-in saved to this profile’s history.');
                await refresh();
                setTimeout(() => { setStep(0); setStarted(null); setMatched(null); setMessage(''); }, 700);
            }
            catch (e) {
                setMessage(e instanceof Error ? e.message : 'Could not save the check-in.');
            }
            finally {
                setSaving(false);
            }
        };
        if (!profile)
            return React.createElement(EmptyState, { title: "Choose a profile first", copy: "A profile keeps the recording attached to the correct personal history." });
        const steps = ['Prepare', 'Quality check', 'Record', 'Review', 'Check-in'];
        return React.createElement("div", { className: "mx-auto max-w-4xl" },
            React.createElement("div", { className: "mb-4 grid gap-2 sm:grid-cols-5", "aria-label": "Recording steps" }, steps.map((x, i) => React.createElement("div", { key: x, className: `rounded-xl border px-3 py-2 text-center text-xs font-extrabold ${step === i ? 'border-mint/45 bg-mint/10 text-mint2' : 'border-line text-slate'}` },
                i + 1,
                ". ",
                x))),
            step === 0 && React.createElement(Card, null,
                React.createElement(SectionTitle, { kicker: "Step 1 \u00B7 Prepare", title: "Set up for a clearer recording." }),
                React.createElement("div", { className: "grid gap-4 lg:grid-cols-[.8fr_1.2fr]" },
                    React.createElement("div", { className: "rounded-2xl border border-line bg-bg/50 p-5" },
                        React.createElement("div", { className: "mx-auto grid h-28 w-28 place-items-center rounded-full border border-mint/30 bg-mint/5 text-mint2" },
                            React.createElement(Icon, { name: "stethoscope", size: 42 })),
                        React.createElement("p", { className: "mt-4 text-center text-sm text-slate2" }, "Minimal placement illustration. Use the same selected recording position for repeated sessions.")),
                    React.createElement("div", null,
                        React.createElement("ul", { className: "space-y-3" }, ['Find a relatively quiet space', 'Place the sensor at your selected recording location', 'Keep the sensor comfortably steady', 'Remain still during capture'].map(x => React.createElement("li", { key: x, className: "flex gap-3 rounded-xl border border-line bg-bg/40 p-3 text-slate2" },
                            React.createElement("span", { className: "mt-0.5 text-mint2" },
                                React.createElement(Icon, { name: "check", size: 17 })),
                            x))),
                        React.createElement("p", { className: "mt-4 text-sm text-slate2" }, "Small changes in movement, contact, or background noise can affect recording quality. Keep your normal routine; do not change meals or behavior just to influence a result."),
                        React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                            React.createElement(Button, { variant: "primary", onClick: () => setStep(1) }, "I\u2019m ready"),
                            React.createElement(Button, { variant: "ghost", onClick: () => alert('Use the same selected abdominal position for repeated recordings. Hold the stethoscope-style sensor comfortably against that position and keep contact steady during the one-minute capture.') }, "See placement guidance"))))),
            step === 1 && React.createElement(Card, null,
                React.createElement(SectionTitle, { kicker: "Step 2 \u00B7 Live quality check", title: "Check the signal before recording." }),
                React.createElement("div", { className: `rounded-2xl border p-4 ${online ? 'border-mint/30 bg-mint/5' : 'border-amber/30 bg-amber/5'}` },
                    React.createElement("div", { className: "flex items-start gap-3" },
                        React.createElement("span", { className: online ? 'text-mint2' : 'text-amber' },
                            React.createElement(Icon, { name: online ? 'radio-tower' : 'wifi-off' })),
                        React.createElement("div", null,
                            React.createElement("strong", { className: "text-warm" }, online ? 'Device connection detected' : 'Device not connected'),
                            React.createElement("p", { className: "mt-1 text-sm text-slate2" }, online ? 'A paired ESP32 checked in recently. Keep the sensor steady before starting.' : 'The cloud dashboard is online, but no paired MOM device has checked in during the last two minutes.')))),
                React.createElement("div", { className: "mt-4" },
                    React.createElement("div", { className: "mb-2 flex items-center justify-between" },
                        React.createElement("span", { className: "text-sm font-bold text-warm" }, "Live waveform"),
                        React.createElement(Badge, { tone: "neutral" }, "Awaiting firmware sample stream")),
                    React.createElement("div", { className: "grid h-36 place-items-center rounded-2xl border border-dashed border-line bg-bg/50 p-5 text-center" },
                        React.createElement("div", null,
                            React.createElement(Icon, { name: "audio-waveform" }),
                            React.createElement("p", { className: "mt-2 text-sm text-slate2" }, "The dashboard does not fabricate live sensor samples. A live waveform will appear here when the firmware exposes a real-time sample stream.")))),
                React.createElement("div", { className: "mt-4 grid gap-3 sm:grid-cols-2" }, ['Contact consistency', 'Background noise', 'Motion stability', 'Clipping / gain'].map(x => React.createElement("div", { key: x, className: "rounded-xl border border-line bg-bg/40 p-3" },
                    React.createElement("div", { className: "text-sm text-slate2" }, x),
                    React.createElement("strong", { className: "mt-1 block text-sm text-warm" }, online ? 'Live metric not reported yet' : 'Waiting for device')))),
                React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                    React.createElement(Button, { variant: "primary", disabled: !online, onClick: begin }, "Begin 60-second recording"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setStep(0) }, "Back")),
                !online && React.createElement("p", { className: "mt-3 text-sm text-amber" }, "Start becomes available after a paired device checks in.")),
            step === 2 && React.createElement(Card, { className: "text-center" },
                React.createElement(Badge, { tone: "coral" }, "\u25CF Recording"),
                React.createElement("div", { className: "mt-6 text-7xl font-black tracking-[-.06em] text-warm sm:text-8xl" },
                    String(Math.floor(seconds / 60)).padStart(2, '0'),
                    ":",
                    String(seconds % 60).padStart(2, '0')),
                React.createElement("p", { className: "mt-3 text-slate2" }, "Keep the sensor steady. This timer guides the capture window while the physical MOM device handles its own upload."),
                React.createElement("div", { className: "mx-auto mt-6 max-w-2xl" },
                    React.createElement(Waveform, { values: MOM.demoWaveform.map((v, i) => v * (1 + ((i + seconds) % 7) / 9)), label: "Animated recording-state visualization, not stored raw audio" })),
                React.createElement("div", { className: "mt-6 flex justify-center gap-3" },
                    React.createElement(Button, { onClick: finish }, "Finish recording"),
                    React.createElement(Button, { variant: "ghost", onClick: () => { if (confirm('Cancel this guided timer? No browser-created session will be saved.')) {
                            setStep(0);
                            setStarted(null);
                        } } }, "Cancel and discard"))),
            step === 3 && React.createElement(Card, null,
                React.createElement(SectionTitle, { kicker: "Step 4 \u00B7 Review", title: "Review recording quality." }),
                React.createElement("div", { className: `rounded-2xl border-l-4 p-4 ${matched ? (matched.quality_label === 'good' ? 'border-mint bg-mint/5' : 'border-amber bg-amber/5') : 'border-amber bg-amber/5'}` }, matched ? React.createElement(React.Fragment, null,
                    React.createElement("strong", { className: "text-lg text-warm" }, matched.quality_label === 'good' ? 'This uploaded recording looks usable for research analysis.' : 'This session was saved, but its signal quality was limited'),
                    React.createElement("p", { className: "mt-2 text-slate2" }, String(matched.quality_summary?.guidance ?? 'The session was received from the paired device. Review the quality details below.'))) : React.createElement(React.Fragment, null,
                    React.createElement("strong", { className: "text-lg text-warm" }, "Waiting for the device upload."),
                    React.createElement("p", { className: "mt-2 text-slate2" }, "The browser timer completed, but MOM has not matched a newly uploaded physical-device session yet. Nothing is silently invented or saved by the browser."))),
                matched && React.createElement("div", { className: "mt-4" },
                    qualityMetricRows(matched).map(r => React.createElement("div", { key: r.label, className: "border-b border-line py-3" },
                        React.createElement("div", { className: "flex justify-between gap-4" },
                            React.createElement("span", { className: "text-sm text-slate2" }, r.label),
                            React.createElement("strong", { className: "text-sm text-warm" }, r.value)),
                        React.createElement("p", { className: "mt-1 text-xs text-slate" }, r.help))),
                    React.createElement("div", { className: "mt-4" },
                        React.createElement(Badge, { tone: matched.learning_eligible ? 'good' : 'warn' }, matched.learning_eligible ? 'Eligible for research-model learning' : 'Saved for reference; not used for learning'))),
                matched && React.createElement("p", { className: "mt-4 text-sm text-slate2" },
                    React.createElement("strong", { className: "text-warm" }, "Would you like to keep this uploaded session?"),
                    " The physical device has already saved it to your private cloud history, so these controls decide whether it remains learning-eligible or reference-only."),
                React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                    matched && React.createElement(Button, { variant: "primary", onClick: () => { setMessage('Session kept with its current learning status.'); setStep(4); } }, "Save session"),
                    matched && React.createElement(Button, { onClick: async () => { await updateSession(matched.id, { learning_eligible: false }); setMatched({ ...matched, learning_eligible: false }); setMessage('Session saved for reference only and excluded from model learning.'); await refresh(); } }, "Save for reference only"),
                    React.createElement(Button, { onClick: findUploaded }, "Refresh uploaded session"),
                    React.createElement(Button, { variant: "ghost", onClick: () => { setStep(0); setMatched(null); setStarted(null); } }, "Try again")),
                React.createElement("div", { className: "mt-3 text-sm text-slate2", "aria-live": "polite" }, message)),
            step === 4 && React.createElement(Card, null,
                React.createElement(SectionTitle, { kicker: "Step 5 \u00B7 Optional check-in", title: "How would you describe your current state?", copy: "Check-ins are optional and are not a medical assessment." }),
                React.createElement("div", { className: "flex flex-wrap gap-2" }, ['I’d like food soon', 'Neutral', 'Recently ate', 'Prefer not to say'].map(x => React.createElement(Button, { key: x, variant: state === x ? 'primary' : 'secondary', onClick: () => { setState(x); if (x === 'Prefer not to say')
                        setShareRating(false); } }, x))),
                React.createElement("div", { className: "mt-6 rounded-2xl border border-line bg-bg/45 p-4" },
                    React.createElement("label", { className: "flex items-center justify-between gap-4 font-bold text-warm" },
                        React.createElement("span", null, "Optional 0\u201310 self-rating"),
                        React.createElement("span", null, shareRating ? `${rating.toFixed(1)} / 10` : 'Not shared')),
                    React.createElement("input", { disabled: !shareRating, value: rating, onChange: e => setRating(Number(e.target.value)), className: "mt-4 w-full accent-[#62B5A6]", type: "range", min: "0", max: "10", step: "0.5" }),
                    React.createElement("label", { className: "mt-3 flex items-center gap-2 text-sm text-slate2" },
                        React.createElement("input", { type: "checkbox", checked: shareRating, onChange: e => setShareRating(e.target.checked), className: "h-5 w-5 accent-[#62B5A6]" }),
                        " Share this optional self-rating")),
                React.createElement("label", { className: "mt-5 flex items-center gap-2 rounded-xl border border-line bg-bg/45 p-3 text-sm text-slate2" },
                    React.createElement("input", { type: "checkbox", checked: preferLess, onChange: e => { setPreferLess(e.target.checked); if (e.target.checked) {
                            setMeal('');
                            setSensorPosition('');
                            setActive(false);
                            setNoisy(false);
                            setNote('');
                        } }, className: "h-5 w-5 accent-[#62B5A6]" }),
                    " I would rather not share more context"),
                !preferLess && React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "mt-5 grid gap-4 md:grid-cols-2" },
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Approximate minutes since last meal",
                            React.createElement("input", { type: "number", min: "0", max: "10080", value: meal, onChange: e => setMeal(e.target.value), placeholder: "Leave blank to skip", className: "min-h-11 rounded-xl border border-line bg-bg px-3 text-warm placeholder:text-slate" })),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Selected sensor position",
                            React.createElement("input", { value: sensorPosition, onChange: e => setSensorPosition(e.target.value), placeholder: "Optional", className: "min-h-11 rounded-xl border border-line bg-bg px-3 text-warm placeholder:text-slate" }))),
                    React.createElement("div", { className: "mt-4 flex flex-wrap gap-4" },
                        React.createElement("label", { className: "flex items-center gap-2 text-sm text-slate2" },
                            React.createElement("input", { type: "checkbox", checked: active, onChange: e => setActive(e.target.checked), className: "h-5 w-5 accent-[#62B5A6]" }),
                            " I was active recently"),
                        React.createElement("label", { className: "flex items-center gap-2 text-sm text-slate2" },
                            React.createElement("input", { type: "checkbox", checked: noisy, onChange: e => setNoisy(e.target.checked), className: "h-5 w-5 accent-[#62B5A6]" }),
                            " The environment was noisy")),
                    React.createElement("label", { className: "mt-4 grid gap-2 text-sm font-bold text-warm" },
                        "Optional notes",
                        React.createElement("textarea", { value: note, onChange: e => setNote(e.target.value), rows: 3, placeholder: "Leave blank if you prefer", className: "rounded-xl border border-line bg-bg p-3 text-warm placeholder:text-slate" }))),
                React.createElement("p", { className: "mt-4 text-sm text-slate2" }, "Optional check-ins can help this profile compare recordings with the user\u2019s own past responses. You can skip without losing the uploaded recording."),
                React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                    React.createElement(Button, { variant: "primary", disabled: saving, onClick: submit }, saving ? 'Saving…' : 'Save check-in'),
                    React.createElement(Button, { variant: "secondary", onClick: () => { setStep(0); setStarted(null); setMatched(null); setMessage('Check-in skipped.'); } }, "Skip check-in")),
                React.createElement("div", { className: "mt-3 text-sm text-slate2", "aria-live": "polite" }, message)));
    }
    function SessionDetail({ session, checkin, profileName, onClose, onDelete, onEditCheckin }) {
        const waveform = Array.isArray(session.acoustic_summary?.waveform) ? session.acoustic_summary.waveform : null;
        return React.createElement(Modal, { title: "Session detail", onClose: onClose },
            React.createElement("div", { className: "flex flex-wrap items-center gap-2" },
                React.createElement(Badge, { tone: qualityTone(session.quality_label) }, qualityName(session.quality_label)),
                React.createElement(Badge, { tone: session.learning_eligible ? 'good' : 'neutral' }, session.learning_eligible ? 'Used for learning' : 'Saved for reference')),
            React.createElement("div", { className: "mt-5 grid gap-3 sm:grid-cols-3" },
                React.createElement("div", { className: "rounded-xl border border-line bg-bg/45 p-3" },
                    React.createElement("span", { className: "text-xs text-slate" }, "Profile"),
                    React.createElement("strong", { className: "mt-1 block text-warm" }, profileName)),
                React.createElement("div", { className: "rounded-xl border border-line bg-bg/45 p-3" },
                    React.createElement("span", { className: "text-xs text-slate" }, "Date & time"),
                    React.createElement("strong", { className: "mt-1 block text-warm" }, fmt(session.started_at))),
                React.createElement("div", { className: "rounded-xl border border-line bg-bg/45 p-3" },
                    React.createElement("span", { className: "text-xs text-slate" }, "Duration"),
                    React.createElement("strong", { className: "mt-1 block text-warm" },
                        session.duration_seconds ?? 'Not reported',
                        " sec"))),
            React.createElement("div", { className: "mt-5" }, waveform ? React.createElement(Waveform, { values: waveform, label: "Waveform summary stored with this session" }) : React.createElement("div", { className: "rounded-2xl border border-dashed border-line bg-bg/45 p-5 text-center" },
                React.createElement(Icon, { name: "audio-waveform" }),
                React.createElement("p", { className: "mt-2 text-sm text-slate2" }, "No waveform array is stored for this session. MOM does not fabricate one."))),
            React.createElement("h3", { className: "mt-6 text-lg font-black text-warm" }, "Signal-quality breakdown"),
            React.createElement("div", { className: "mt-2" }, qualityMetricRows(session).map(r => React.createElement("div", { key: r.label, className: "border-b border-line py-3" },
                React.createElement("div", { className: "flex justify-between gap-4" },
                    React.createElement("span", { className: "text-sm text-slate2" }, r.label),
                    React.createElement("strong", { className: "text-sm text-warm" }, r.value)),
                React.createElement("p", { className: "mt-1 text-xs text-slate" }, r.help)))),
            React.createElement("div", { className: "mt-5 rounded-2xl border border-line bg-bg/45 p-4" },
                React.createElement("h3", { className: "font-black text-warm" }, "Optional check-in"),
                checkin ? React.createElement("p", { className: "mt-2 text-sm text-slate2" },
                    "Self-rating: ",
                    checkin.hunger_rating ?? 'Not shared',
                    " \u00B7 Minutes since eating: ",
                    checkin.minutes_since_eating ?? 'Not shared',
                    ".") : React.createElement("p", { className: "mt-2 text-sm text-slate2" }, "No optional check-in is linked to this session.")),
            React.createElement("p", { className: "mt-5 text-sm font-bold text-warm" }, "This session contributes only to this profile\u2019s history."),
            React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "One recording alone does not determine an experimental summary."),
            React.createElement("div", { className: "mt-6 flex flex-wrap gap-3" },
                React.createElement(Button, { onClick: onEditCheckin }, "Add or edit check-in"),
                React.createElement(Button, { onClick: () => downloadJson(`mom-session-${session.id}.json`, { session, checkin: checkin ?? null }) }, "Export session data"),
                React.createElement(Button, { variant: "danger", onClick: onDelete }, "Delete session")));
    }
    function SessionsView({ sessions, checkins, profileName, onDelete, onAddCheckin }) {
        const [selected, setSelected] = useState(null);
        const [deleteTarget, setDeleteTarget] = useState(null);
        if (!sessions.length)
            return React.createElement(EmptyState, { title: "No recordings yet", copy: "Start a guided recording when the paired MOM device is connected." });
        return React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement(SectionTitle, { kicker: "Sessions", title: "Your recording history", copy: "Each session shows what was actually stored by the paired device." }),
                React.createElement("div", { className: "grid gap-3" }, sessions.map(s => { const c = checkins.find(x => x.session_id === s.id); const waveform = Array.isArray(s.acoustic_summary?.waveform) ? s.acoustic_summary.waveform : null; return React.createElement(Card, { key: s.id, className: "p-4" },
                    React.createElement("div", { className: "grid gap-4 lg:grid-cols-[160px_1fr_auto] lg:items-center" },
                        waveform ? React.createElement(Waveform, { compact: true, values: waveform, label: "Stored waveform thumbnail" }) : React.createElement("div", { className: "grid h-20 place-items-center rounded-2xl border border-dashed border-line bg-bg/45 text-slate" },
                            React.createElement(Icon, { name: "audio-waveform" })),
                        React.createElement("div", null,
                            React.createElement("div", { className: "flex flex-wrap items-center gap-2" },
                                React.createElement("strong", { className: "text-warm" }, fmt(s.started_at)),
                                React.createElement(Badge, { tone: qualityTone(s.quality_label) }, qualityName(s.quality_label))),
                            React.createElement("div", { className: "mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate2" },
                                React.createElement("span", null,
                                    s.duration_seconds ?? '—',
                                    " sec"),
                                React.createElement("span", null, s.learning_eligible ? 'Used for learning' : 'Saved for reference'),
                                React.createElement("span", null, c ? 'Optional check-in added' : 'No check-in'))),
                        React.createElement(Button, { variant: "ghost", onClick: () => setSelected(s) }, "View session"))); }))),
            selected && React.createElement(SessionDetail, { session: selected, checkin: checkins.find(c => c.session_id === selected.id), profileName: profileName, onClose: () => setSelected(null), onDelete: () => setDeleteTarget(selected), onEditCheckin: () => { onAddCheckin(selected); setSelected(null); } }),
            deleteTarget && React.createElement(Modal, { title: "Delete this session?", onClose: () => setDeleteTarget(null) },
                React.createElement("p", { className: "text-slate2" }, "This permanently removes the selected session from this account. This action cannot be undone."),
                React.createElement("div", { className: "mt-6 flex gap-3" },
                    React.createElement(Button, { variant: "danger", onClick: async () => { await onDelete(deleteTarget.id); setDeleteTarget(null); setSelected(null); } }, "Delete session"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setDeleteTarget(null) }, "Cancel"))));
    }
    function TimelineChart({ checkins }) {
        const ref = useRef(null), chart = useRef(null);
        const points = [...checkins].filter(c => c.hunger_rating !== null && c.hunger_rating !== undefined).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        useEffect(() => {
            if (!ref.current || !window.Chart || !points.length)
                return;
            chart.current?.destroy?.();
            chart.current = new window.Chart(ref.current, {
                type: 'line',
                data: { labels: points.map(c => fmtShort(c.created_at)), datasets: [{ label: 'Optional self-reported rating', data: points.map(c => Number(c.hunger_rating)), borderColor: '#62B5A6', backgroundColor: 'rgba(142,228,190,.12)', pointBackgroundColor: '#62B5A6', tension: .25, fill: true }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#EAF0EF' } } }, scales: { x: { ticks: { color: '#283A42' }, grid: { color: 'rgba(36,72,61,.35)' } }, y: { min: 0, max: 10, ticks: { color: '#283A42' }, grid: { color: 'rgba(36,72,61,.35)' } } } }
            });
            return () => chart.current?.destroy?.();
        }, [checkins.length]);
        if (!points.length)
            return React.createElement(EmptyState, { title: "No optional rating timeline yet", copy: "A chart appears only after this profile has voluntarily saved check-in ratings." });
        return React.createElement("div", null,
            React.createElement("div", { className: "h-72" },
                React.createElement("canvas", { ref: ref, "aria-label": "Timeline of this profile's optional self-reported ratings from zero to ten" })),
            React.createElement("details", { className: "mt-3 rounded-xl border border-line bg-bg/35 p-3" },
                React.createElement("summary", { className: "cursor-pointer text-sm font-bold text-warm" }, "How to read this chart"),
                React.createElement("p", { className: "mt-2 text-sm text-slate2" }, "Each point is a voluntarily reported self-rating saved by this profile. The line connects reports over time for readability; it does not represent a physiological measurement or causal trend.")),
            React.createElement("p", { className: "mt-3 text-sm text-slate2", id: "timelineSummary" },
                "Accessible summary: ",
                points.length,
                " optional self-reported rating",
                points.length === 1 ? '' : 's',
                " are shown from ",
                fmtShort(points[0].created_at),
                " to ",
                fmtShort(points[points.length - 1].created_at),
                ". This is a record of user responses, not a physiological measurement."));
    }
    function InsightsView({ sessions, checkins }) {
        const usable = usableSessions(sessions), level = evidenceLevel(usable.length), summary = summaryFor(sessions, checkins);
        return React.createElement("div", null,
            React.createElement(SectionTitle, { kicker: "Insights / pattern history", title: "See what this profile has actually collected.", copy: "The page separates observed data from experimental interpretation and never turns counts into a health score." }),
            React.createElement("div", { className: "grid gap-4 sm:grid-cols-3" },
                React.createElement(Card, null,
                    React.createElement("span", { className: "text-sm text-slate2" }, "Total recordings"),
                    React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, sessions.length)),
                React.createElement(Card, null,
                    React.createElement("span", { className: "text-sm text-slate2" }, "Usable recordings"),
                    React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, usable.length)),
                React.createElement(Card, null,
                    React.createElement("span", { className: "text-sm text-slate2" }, "Recordings with optional check-ins"),
                    React.createElement("div", { className: "mt-2 text-4xl font-black text-warm" }, new Set(checkins.filter(c => c.session_id).map(c => c.session_id)).size))),
            React.createElement("div", { className: "mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]" },
                React.createElement(Card, null,
                    React.createElement("div", { className: "flex items-center justify-between" },
                        React.createElement("h3", { className: "text-xl font-black text-warm" }, "Optional check-in timeline"),
                        React.createElement(Badge, { tone: "neutral" }, "User-reported data")),
                    React.createElement("div", { className: "mt-5" },
                        React.createElement(TimelineChart, { checkins: checkins }))),
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Evidence level"),
                    React.createElement("div", { className: "mt-3" },
                        React.createElement(Badge, { tone: usable.length >= 8 ? 'good' : 'warn' }, level)),
                    React.createElement("p", { className: "mt-4 text-slate2" },
                        "This profile has ",
                        sessions.length,
                        " recording",
                        sessions.length === 1 ? '' : 's',
                        ", ",
                        usable.length,
                        " usable recording",
                        usable.length === 1 ? '' : 's',
                        ", and ",
                        checkins.length,
                        " optional check-in",
                        checkins.length === 1 ? '' : 's',
                        "."),
                    React.createElement("div", { className: "mt-5 space-y-3" },
                        React.createElement("div", { className: "rounded-xl border border-line bg-bg/40 p-3" },
                            React.createElement("strong", { className: "text-warm" }, "Acoustic-only data"),
                            React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "Available when usable session acoustic summaries are present.")),
                        React.createElement("div", { className: "rounded-xl border border-line bg-bg/40 p-3" },
                            React.createElement("strong", { className: "text-warm" }, "Optional check-in data"),
                            React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "Comes only from what this profile voluntarily reports.")),
                        React.createElement("div", { className: "rounded-xl border border-line bg-bg/40 p-3" },
                            React.createElement("strong", { className: "text-warm" }, "Combined personalized research model"),
                            React.createElement("p", { className: "mt-1 text-sm text-slate2" }, "Displayed only when a supported model output is actually available."))))),
            React.createElement("div", { className: "mt-5 grid gap-5 lg:grid-cols-2" },
                React.createElement(SummaryCard, { summary: summary, onRecord: () => pushRoute('dashboard', 'record'), onInsights: () => { } }),
                React.createElement(Card, null,
                    React.createElement("details", { open: true },
                        React.createElement("summary", { className: "cursor-pointer text-xl font-black text-warm focus-visible:ring-2 focus-visible:ring-mint" }, "What MOM can and cannot conclude"),
                        React.createElement("div", { className: "mt-4 grid gap-3 text-sm" },
                            React.createElement("div", { className: "rounded-xl border border-mint/25 bg-mint/5 p-4 text-slate2" },
                                React.createElement("strong", { className: "text-mint2" }, "Can compare"),
                                React.createElement("p", { className: "mt-1" }, "Patterns within this profile\u2019s usable recordings, optional self-reports, meal timing, and uploaded research-model outputs.")),
                            React.createElement("div", { className: "rounded-xl border border-amber/25 bg-amber/5 p-4 text-slate2" },
                                React.createElement("strong", { className: "text-[#62B5A6]" }, "Cannot conclude"),
                                React.createElement("p", { className: "mt-1" }, "Disease, physiology, objective hunger, nutritional need, medical safety, or causation.")))))));
    }
    function PreferencesView({ user, profile, preferences, save, remove, onOpenDoorDash }) {
        const [cats, setCats] = useState(preferences?.categories ?? []);
        const c = preferences?.constraints ?? {};
        const [dietary, setDietary] = useState(Array.isArray(c.dietaryPreferences) ? c.dietaryPreferences : []);
        const [budget, setBudget] = useState(String(c.budgetRange ?? ''));
        const [time, setTime] = useState(String(c.availableTime ?? ''));
        const [delivery, setDelivery] = useState(String(c.deliveryPreference ?? ''));
        const [favorites, setFavorites] = useState(String(c.favorites ?? ''));
        const [avoid, setAvoid] = useState(String(c.avoid ?? ''));
        const [notes, setNotes] = useState(String(c.notes ?? ''));
        const [liked, setLiked] = useState(Array.isArray(c.likedItems) ? c.likedItems : []);
        const [avoided, setAvoided] = useState(Array.isArray(c.avoidedItems) ? c.avoidedItems : []);
        const [msg, setMsg] = useState('');
        useEffect(() => { setCats(preferences?.categories ?? []); const d = preferences?.constraints ?? {}; setDietary(Array.isArray(d.dietaryPreferences) ? d.dietaryPreferences : []); setBudget(String(d.budgetRange ?? '')); setTime(String(d.availableTime ?? '')); setDelivery(String(d.deliveryPreference ?? '')); setFavorites(String(d.favorites ?? '')); setAvoid(String(d.avoid ?? '')); setNotes(String(d.notes ?? '')); setLiked(Array.isArray(d.likedItems) ? d.likedItems : []); setAvoided(Array.isArray(d.avoidedItems) ? d.avoidedItems : []); }, [preferences?.id, profile?.id]);
        if (!profile)
            return React.createElement(EmptyState, { title: "Choose a profile first", copy: "Food preferences are profile-separated and optional." });
        const toggle = (arr, v, setter) => setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
        const matches = MOM.preferenceIdeas.filter(i => cats.includes('No preference') || !cats.length || i.tags.some(t => cats.includes(t))).filter(i => !avoided.includes(i.id)).slice(0, 3);
        const persist = async () => { setMsg('Saving…'); try {
            await save({ id: preferences?.id, owner_id: user.id, profile_id: profile.id, categories: cats, constraints: { dietaryPreferences: dietary, budgetRange: budget, availableTime: time, deliveryPreference: delivery, favorites, avoid, notes, likedItems: liked, avoidedItems: avoided } });
            setMsg('Preferences saved.');
        }
        catch (e) {
            setMsg(e instanceof Error ? e.message : 'Could not save preferences.');
        } };
        return React.createElement("div", null,
            React.createElement(SectionTitle, { kicker: "Optional preferences", title: "Preference matches, not nutrition advice.", copy: "These settings are voluntary and stay separate from the acoustic research model." }),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-[1.05fr_.95fr]" },
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Preferred categories"),
                    React.createElement("div", { className: "mt-4 flex flex-wrap gap-2" }, categoryOptions.map(x => React.createElement(Button, { key: x, variant: cats.includes(x) ? 'primary' : 'secondary', onClick: () => { if (x === 'No preference')
                            setCats(['No preference']);
                        else {
                            const without = cats.filter(v => v !== 'No preference');
                            toggle(without, x, setCats);
                        } } }, x))),
                    React.createElement("h3", { className: "mt-6 text-xl font-black text-warm" }, "Practical constraints"),
                    React.createElement("div", { className: "mt-4 flex flex-wrap gap-2" }, dietaryOptions.map(x => React.createElement(Button, { key: x, variant: dietary.includes(x) ? 'primary' : 'secondary', onClick: () => toggle(dietary, x, setDietary) }, x))),
                    React.createElement("div", { className: "mt-4 grid gap-4 sm:grid-cols-2" },
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Budget range",
                            React.createElement("select", { value: budget, onChange: e => setBudget(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3" },
                                React.createElement("option", { value: "" }, "No preference"),
                                React.createElement("option", null, "$"),
                                React.createElement("option", null, "$$"),
                                React.createElement("option", null, "$$$"))),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Time available",
                            React.createElement("select", { value: time, onChange: e => setTime(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3" },
                                React.createElement("option", { value: "" }, "No preference"),
                                React.createElement("option", null, "Under 10 minutes"),
                                React.createElement("option", null, "Under 20 minutes"),
                                React.createElement("option", null, "30+ minutes"))),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Distance / delivery preference",
                            React.createElement("select", { value: delivery, onChange: e => setDelivery(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3" },
                                React.createElement("option", { value: "" }, "No preference"),
                                React.createElement("option", null, "Food at home"),
                                React.createElement("option", null, "Pickup nearby"),
                                React.createElement("option", null, "Delivery"))),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                            "Favorite categories",
                            React.createElement("input", { value: favorites, onChange: e => setFavorites(e.target.value), placeholder: "Optional", className: "min-h-11 rounded-xl border border-line bg-bg px-3" })),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm sm:col-span-2" },
                            "Categories to avoid",
                            React.createElement("input", { value: avoid, onChange: e => setAvoid(e.target.value), placeholder: "Optional", className: "min-h-11 rounded-xl border border-line bg-bg px-3" })),
                        React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm sm:col-span-2" },
                            "Other practical notes",
                            React.createElement("textarea", { rows: 3, value: notes, onChange: e => setNotes(e.target.value), placeholder: "Allergies, food at home, prep limits, or leave blank", className: "rounded-xl border border-line bg-bg p-3" }))),
                    React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                        React.createElement(Button, { variant: "primary", onClick: persist }, "Save preferences"),
                        React.createElement(Button, { variant: "ghost", onClick: () => { setCats([]); setDietary([]); setBudget(''); setTime(''); setDelivery(''); setFavorites(''); setAvoid(''); setNotes(''); } }, "Clear form"),
                        preferences?.id && React.createElement(Button, { variant: "danger", onClick: async () => { if (confirm('Remove all saved preferences for this profile?')) {
                                await remove();
                                setMsg('Saved preferences removed.');
                            } } }, "Remove preferences")),
                    React.createElement("div", { className: "mt-3 text-sm text-slate2", "aria-live": "polite" }, msg)),
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Optional preference-based ideas"),
                    React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "These are preference matches, not medical or nutrition recommendations."),
                    React.createElement("div", { className: "mt-4 space-y-3" }, matches.length ? matches.map(i => React.createElement("div", { key: i.id, className: "rounded-2xl border border-line bg-bg/45 p-4" },
                        React.createElement("div", { className: "flex items-start justify-between gap-3" },
                            React.createElement("div", null,
                                React.createElement("strong", { className: "text-warm" }, i.title),
                                React.createElement("p", { className: "mt-1 text-sm text-slate2" },
                                    "Matches: ",
                                    i.tags.filter(t => cats.includes(t)).join(', ') || 'general saved preferences',
                                    time ? `, ${time.toLowerCase()}` : '',
                                    budget ? `, budget ${budget}` : '')),
                            liked.includes(i.id) && React.createElement(Badge, { tone: "good" }, "Liked")),
                        React.createElement("p", { className: "mt-2 text-sm text-slate2" }, i.note),
                        React.createElement("div", { className: "mt-3 flex flex-wrap gap-2" },
                            React.createElement(Button, { variant: "ghost", onClick: () => { setLiked(v => v.includes(i.id) ? v.filter(x => x !== i.id) : [...v, i.id]); setAvoided(v => v.filter(x => x !== i.id)); } }, "\uD83D\uDC4D Like"),
                            React.createElement(Button, { variant: "ghost", onClick: () => { setAvoided(v => v.includes(i.id) ? v.filter(x => x !== i.id) : [...v, i.id]); setLiked(v => v.filter(x => x !== i.id)); } }, "Not for me"),
                            React.createElement(Button, { onClick: () => onOpenDoorDash(i.title) }, "Open in DoorDash")))) : React.createElement(EmptyState, { title: "No preference matches yet", copy: "Save a few optional categories or practical constraints to generate simple matches." })),
                    React.createElement("p", { className: "mt-4 text-xs leading-5 text-slate" }, "MOM does not place orders, process payment, or automatically send data to DoorDash. No affiliate integration is used here."))));
    }
    function PrivacyView({ profile, profiles, onSwitch, onCreate, onGuest, onSessions, exportData, onDeleteProfile, onSignOut }) {
        return React.createElement("div", null,
            React.createElement(SectionTitle, { kicker: "Profiles & privacy", title: "Your data stays profile-separated.", copy: "Database rules restrict private MOM records to the authenticated account that owns them." }),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-2" },
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Current profile"),
                    React.createElement("select", { value: profile?.id ?? '', onChange: e => onSwitch(e.target.value), className: "mt-4 min-h-11 w-full rounded-xl border border-line bg-bg px-3" },
                        React.createElement("option", { value: "" }, "Choose a profile"),
                        profiles.map(p => React.createElement("option", { key: p.id, value: p.id }, p.display_name))),
                    React.createElement("div", { className: "mt-4 flex flex-wrap gap-2" },
                        React.createElement(Button, { onClick: onCreate }, "Create new profile"),
                        React.createElement(Button, { variant: "ghost", onClick: onGuest }, "Enter Guest Mode"))),
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Your controls"),
                    React.createElement("div", { className: "mt-4 grid gap-2" },
                        React.createElement(Button, { onClick: exportData, disabled: !profile }, "Export my data"),
                        React.createElement(Button, { onClick: onSessions }, "Manage / delete sessions"),
                        React.createElement(Button, { variant: "secondary", onClick: onSignOut }, "Manage remote dashboard access \u00B7 Sign out"),
                        React.createElement(Button, { variant: "danger", onClick: onDeleteProfile, disabled: !profile }, "Delete profile data"))),
                React.createElement(Card, { className: "lg:col-span-2" },
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Data boundaries"),
                    React.createElement("div", { className: "mt-4 grid gap-3 sm:grid-cols-2" },
                        React.createElement("div", { className: "rounded-2xl border border-line bg-bg/45 p-4" },
                            React.createElement("strong", { className: "text-mint2" }, "Profile A"),
                            React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" },
                                "\u2192 its recordings",
                                React.createElement("br", null),
                                "\u2192 its optional check-ins",
                                React.createElement("br", null),
                                "\u2192 its preferences",
                                React.createElement("br", null),
                                "\u2192 its research-model history")),
                        React.createElement("div", { className: "rounded-2xl border border-line bg-bg/45 p-4" },
                            React.createElement("strong", { className: "text-mint2" }, "Profile B"),
                            React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" },
                                "\u2192 its recordings",
                                React.createElement("br", null),
                                "\u2192 its optional check-ins",
                                React.createElement("br", null),
                                "\u2192 its preferences",
                                React.createElement("br", null),
                                "\u2192 its research-model history"))),
                    React.createElement("p", { className: "mt-4 font-black text-warm" }, "No data is mixed across profiles."),
                    React.createElement("p", { className: "mt-2 text-sm text-slate2" }, "Storage configuration: private profile records are stored in the MOM Supabase cloud project and protected by Row Level Security tied to the authenticated account. Guest Mode does not query those tables."))));
    }
    function DeviceView({ user, profile, devices, sessions, refresh, cloud }) {
        const [checking, setChecking] = useState(false), [msg, setMsg] = useState(''), [pair, setPair] = useState(null);
        const d = devices[0] ?? null, online = isOnline(devices), latest = latestSession(sessions), acoustic = latest?.acoustic_summary ?? {};
        const connectionCheck = async () => { setChecking(true); setMsg('Refreshing device status…'); const fresh = await refresh(); setChecking(false); setMsg(isOnline(fresh?.devices ?? devices) ? 'A recent device heartbeat is available.' : 'No recent device heartbeat was found.'); };
        const pairDevice = async () => { if (!profile)
            return; setMsg('Creating a one-time device credential…'); try {
            const out = await cloud.pairDevice(user.id, profile.id);
            setPair(out);
            setMsg('Device credential created. Copy it once into firmware configuration; MOM stores only its hash.');
            await refresh();
        }
        catch (e) {
            setMsg(e instanceof Error ? e.message : 'Could not create device credential.');
        } };
        if (!profile)
            return React.createElement(EmptyState, { title: "Choose a profile first", copy: "A paired physical device is attached to one profile so uploaded sessions do not mix between wearers." });
        const issue = !online ? ['No device found', 'The dashboard is cloud-hosted, but the paired ESP32 has not checked in recently.', 'Power the ESP32 and make sure it can reach a saved Wi-Fi network or phone hotspot.'] : latest?.quality_label === 'poor' ? ['Recording quality needs attention', String(latest.quality_summary?.guidance ?? 'Movement, noise, or inconsistent contact may have limited the latest recording.'), 'Keep the sensor steady, reduce background noise, and review gain if clipping is reported.'] : ['Device ready', 'A paired device checked in recently.', 'Use the guided recording flow when you are ready.'];
        return React.createElement("div", null,
            React.createElement(SectionTitle, { kicker: "Device settings", title: "Connection first. Technical detail only when you want it.", copy: "Normal use does not require Arduino after firmware is flashed once. The ESP32 still needs electricity and an internet path for cloud upload." }),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-[1.1fr_.9fr]" },
                React.createElement(Card, null,
                    React.createElement("div", { className: "flex flex-wrap items-start justify-between gap-3" },
                        React.createElement("div", null,
                            React.createElement("h3", { className: "text-2xl font-black text-warm" }, online ? 'MOM device connected' : 'MOM device offline'),
                            React.createElement("p", { className: "mt-2 text-slate2" }, online ? 'A paired device checked in recently and can upload sessions to the cloud.' : 'No paired device has checked in recently.')),
                        React.createElement(DevicePill, { devices: devices })),
                    React.createElement("div", { className: "mt-5 grid gap-3 sm:grid-cols-2" }, [
                        ['ESP32', online ? 'Connected' : 'Offline'], ['Wi-Fi / hotspot', online ? 'Connection inferred from cloud heartbeat' : 'Unknown'], ['Last successful sync', fmt(d?.last_seen_at)], ['Firmware', d?.firmware_version ?? 'Not reported'], ['Microphone gain', metricLabel(latest?.quality_summary?.gainLevel)], ['Calibration / signal check', online ? 'Connection check available' : 'Connect device first']
                    ].map(([l, v]) => React.createElement("div", { key: l, className: "rounded-xl border border-line bg-bg/45 p-3" },
                        React.createElement("div", { className: "text-xs text-slate" }, l),
                        React.createElement("strong", { className: "mt-1 block text-sm text-warm" }, v)))),
                    React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                        React.createElement(Button, { onClick: connectionCheck, disabled: checking }, checking ? 'Checking…' : 'Run connection check'),
                        React.createElement(Button, { variant: "primary", onClick: pairDevice }, "Create device credential")),
                    React.createElement("div", { className: "mt-3 text-sm text-slate2", "aria-live": "polite" }, msg),
                    pair && React.createElement("div", { className: "mt-4 rounded-2xl border border-amber/30 bg-amber/5 p-4" },
                        React.createElement("strong", { className: "text-warm" }, "Copy this credential once"),
                        React.createElement("div", { className: "mt-2 overflow-x-auto rounded-xl bg-[#071014] p-3 font-mono text-xs text-mint2" }, pair.token),
                        React.createElement("p", { className: "mt-3 text-xs text-slate2" }, "Cloud endpoint"),
                        React.createElement("div", { className: "mt-1 overflow-x-auto rounded-xl bg-[#071014] p-3 font-mono text-xs text-slate2" }, pair.endpoint))),
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Recommended next step"),
                    React.createElement("div", { className: `mt-4 rounded-2xl border-l-4 p-4 ${online ? 'border-mint bg-mint/5' : 'border-amber bg-amber/5'}` },
                        React.createElement("strong", { className: "text-warm" }, issue[0]),
                        React.createElement("p", { className: "mt-2 text-sm text-slate2" }, issue[1]),
                        React.createElement("p", { className: "mt-2 text-sm font-bold text-warm" }, issue[2])),
                    React.createElement("h3", { className: "mt-6 text-lg font-black text-warm" }, "Troubleshooting"),
                    React.createElement("div", { className: "mt-3 space-y-2" }, [['No device found', 'Check power, firmware, and internet connectivity.'], ['Weak signal', 'Move closer to Wi-Fi or use a stable phone hotspot.'], ['Clipping detected', 'Reduce microphone gain only if the current hardware configuration requires it; changing gain creates a new measurement configuration.'], ['Wi-Fi disconnected', 'A power bank supplies electricity, not internet.'], ['Unexpected background noise', 'Move to a quieter area and keep the sensor steady.']].map(([t, c]) => React.createElement("details", { key: t, className: "rounded-xl border border-line bg-bg/35 p-3" },
                        React.createElement("summary", { className: "cursor-pointer font-bold text-warm" }, t),
                        React.createElement("p", { className: "mt-2 text-sm text-slate2" }, c))))),
                React.createElement(Card, { className: "lg:col-span-2" },
                    React.createElement("details", null,
                        React.createElement("summary", { className: "cursor-pointer text-xl font-black text-warm focus-visible:ring-2 focus-visible:ring-mint" }, "Advanced device details"),
                        React.createElement("div", { className: "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" }, [
                            ['Serial connection', 'Not used by cloud dashboard'], ['Firmware version', d?.firmware_version ?? 'Not reported'], ['Sample rate', acoustic.sample_rate ? `${acoustic.sample_rate} Hz` : 'Not reported by uploaded session'], ['Upload queue', 'Not exposed by firmware'], ['Debug logs', 'Not exposed to the public cloud UI'], ['Audio format', String(acoustic.audio_format ?? 'Not reported')], ['Device identifier', d?.id ?? 'Not paired'], ['Hardware', d?.hardware ?? 'ESP32 + MAX4466']
                        ].map(([l, v]) => React.createElement("div", { key: l, className: "rounded-xl border border-line bg-bg/45 p-3" },
                            React.createElement("div", { className: "text-xs text-slate" }, l),
                            React.createElement("strong", { className: "mt-1 block break-words text-sm text-warm" }, v)))))),
                React.createElement(Card, { className: "lg:col-span-2" },
                    React.createElement("h3", { className: "text-lg font-black text-warm" }, "Normal use"),
                    React.createElement("div", { className: "mt-4 flex flex-col gap-2 md:flex-row md:items-center" }, ['Power bank', 'ESP32 boots automatically', 'Saved Wi-Fi / phone hotspot', 'Cloud upload', 'Private dashboard'].map((x, i) => React.createElement(React.Fragment, { key: x },
                        React.createElement("div", { className: "flex-1 rounded-xl border border-line bg-bg/45 p-3 text-center text-sm font-bold text-slate2" }, x),
                        i < 4 && React.createElement("div", { className: "grid place-items-center text-mint2" },
                            React.createElement(Icon, { name: window.innerWidth < 768 ? 'arrow-down' : 'arrow-right' }))))),
                    React.createElement("p", { className: "mt-4 text-sm text-slate2" }, "Arduino is not required during normal use after firmware is flashed once. A power bank supplies power only. Cloud upload still requires Wi-Fi, a phone hotspot, or additional cellular hardware."))));
    }
    function AdvancedView({ sessions }) {
        const latest = latestSession(sessions), a = latest?.acoustic_summary ?? {};
        return React.createElement("div", null,
            React.createElement(SectionTitle, { kicker: "Advanced / engineering", title: "Technical detail without taking over the beginner experience." }),
            React.createElement("div", { className: "grid gap-5 lg:grid-cols-2" },
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "System architecture"),
                    React.createElement("p", { className: "mt-3 text-slate2" }, "ESP32 + MAX4466 + stethoscope coupling \u2192 cloud device ingest \u2192 signal-quality summaries \u2192 profile-separated history \u2192 optional experimental model outputs."),
                    React.createElement("div", { className: "mt-5 flex flex-wrap gap-2" },
                        React.createElement(Badge, { tone: "neutral" }, "ESP32"),
                        React.createElement(Badge, { tone: "neutral" }, "MAX4466"),
                        React.createElement(Badge, { tone: "neutral" }, "~8 kHz when reported"),
                        React.createElement(Badge, { tone: "neutral" }, "Supabase cloud"))),
                React.createElement(Card, null,
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Three research views"),
                    React.createElement("div", { className: "mt-4 space-y-3" }, [['Time-based baseline', 'Uses voluntarily supplied meal timing only.'], ['Sound-only research view', 'Uses usable uploaded acoustic features only.'], ['Personalized research model', 'Combines acoustic features with this profile’s own optional prior check-ins when a supported model output exists.']].map(([t, c]) => React.createElement("div", { key: t, className: "rounded-xl border border-line bg-bg/45 p-3" },
                        React.createElement("strong", { className: "text-warm" }, t),
                        React.createElement("p", { className: "mt-1 text-sm text-slate2" }, c))))),
                React.createElement(Card, { className: "lg:col-span-2" },
                    React.createElement("h3", { className: "text-xl font-black text-warm" }, "Latest uploaded acoustic summary"),
                    latest ? React.createElement("div", { className: "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" }, [['RMS', a.rms], ['Spectral bandwidth', a.spectral_bandwidth], ['Spectral centroid', a.spectral_centroid], ['Spectral entropy', a.spectral_entropy], ['Candidate events / min', a.events_per_minute], ['Event duration', a.event_duration_seconds], ['Sample rate', a.sample_rate], ['Audio format', a.audio_format]].map(([l, v]) => React.createElement("div", { key: String(l), className: "rounded-xl border border-line bg-bg/45 p-3" },
                        React.createElement("div", { className: "text-xs text-slate" }, l),
                        React.createElement("strong", { className: "mt-1 block text-sm text-warm" }, metricLabel(v))))) : React.createElement(EmptyState, { title: "No uploaded acoustic summary yet", copy: "Advanced metrics appear only when the physical device or analysis pipeline actually uploads them." }))));
    }
    function Dashboard({ cloud, user, onSignOut }) {
        const route = readRoute();
        const [tab, setTabState] = useState(route.tab);
        const [profiles, setProfiles] = useState([]), [profile, setProfile] = useState(null), [sessions, setSessions] = useState([]), [checkins, setCheckins] = useState([]), [devices, setDevices] = useState([]), [preferences, setPreferences] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [newName, setNewName] = useState(''), [deleteProfileOpen, setDeleteProfileOpen] = useState(false), [createProfileOpen, setCreateProfileOpen] = useState(false), [doorDashIdea, setDoorDashIdea] = useState(null), [pendingSwitch, setPendingSwitch] = useState(null), [checkinSession, setCheckinSession] = useState(null);
        const setTab = (t) => { setTabState(t); pushRoute('dashboard', t, true); };
        const loadProfileData = async (p) => { if (!p) {
            setSessions([]);
            setCheckins([]);
            setDevices([]);
            setPreferences(null);
            return;
        } const d = await cloud.loadProfileData(p.id); setSessions(d.sessions); setCheckins(d.checkins); setDevices(d.devices); setPreferences(d.preferences); };
        const loadProfiles = async () => { setError(''); const p = await cloud.loadProfiles(); setProfiles(p); let target = profile && p.find(x => x.id === profile.id) || null; if (!target) {
            const saved = localStorage.getItem('mom-last-profile');
            target = p.find(x => x.id === saved) || (p.length === 1 ? p[0] : null);
        } setProfile(target); if (target)
            localStorage.setItem('mom-last-profile', target.id); await loadProfileData(target); };
        const refresh = async () => { if (!profile)
            return null; const d = await cloud.loadProfileData(profile.id); setSessions(d.sessions); setCheckins(d.checkins); setDevices(d.devices); setPreferences(d.preferences); return d; };
        useEffect(() => { (async () => { try {
            setLoading(true);
            await loadProfiles();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load private dashboard.');
        }
        finally {
            setLoading(false);
        } })(); }, []);
        useEffect(() => { const h = () => { const r = readRoute(); if (r.view === 'dashboard')
            setTabState(r.tab); }; window.addEventListener('popstate', h); return () => window.removeEventListener('popstate', h); }, []);
        const requestSwitch = (id) => { if (!id) {
            setProfile(null);
            setSessions([]);
            setCheckins([]);
            setDevices([]);
            setPreferences(null);
            return;
        } if (profile && profile.id !== id) {
            setPendingSwitch(id);
        }
        else {
            const p = profiles.find(x => x.id === id) || null;
            setProfile(p);
            if (p) {
                localStorage.setItem('mom-last-profile', p.id);
                loadProfileData(p);
            }
        } };
        const confirmSwitch = async () => { const p = profiles.find(x => x.id === pendingSwitch) || null; setPendingSwitch(null); setProfile(p); if (p) {
            localStorage.setItem('mom-last-profile', p.id);
            await loadProfileData(p);
        } };
        const create = async () => { const name = newName.trim(); if (!name)
            return; try {
            const p = await cloud.createProfile(user.id, name);
            setNewName('');
            setProfiles(v => [...v, p]);
            setProfile(p);
            localStorage.setItem('mom-last-profile', p.id);
            await loadProfileData(p);
            setCreateProfileOpen(false);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create profile.');
        } };
        const savePrefs = async (p) => { await cloud.savePreferences(p); await refresh(); };
        const removePrefs = async () => { if (!profile)
            return; await cloud.deletePreferences(profile.id); await refresh(); };
        const updateSession = async (id, payload) => { await cloud.updateSession(id, payload); await refresh(); };
        const deleteSession = async (id) => { await cloud.deleteSession(id); await refresh(); };
        const saveCheckin = async (p) => { await cloud.saveCheckIn(p); await refresh(); };
        const exportData = () => { if (!profile)
            return; downloadJson(`mom-${safeFileName(profile.display_name)}-export.json`, { profile, sessions, checkins, preferences, devices: devices.map(({ id, display_name, hardware, firmware_version, last_seen_at }) => ({ id, display_name, hardware, firmware_version, last_seen_at })) }); };
        const deleteProfile = async () => { if (!profile)
            return; await cloud.deleteProfile(profile.id); setDeleteProfileOpen(false); setProfile(null); localStorage.removeItem('mom-last-profile'); await loadProfiles(); };
        const startCheckinForSession = (s) => { setCheckinSession(s); };
        const saveSessionCheckin = async (rating, meal, note) => { if (!profile || !checkinSession)
            return; const existing = checkins.find(c => c.session_id === checkinSession.id); if (existing) {
            await cloud.updateCheckIn(existing.id, { hunger_rating: rating, minutes_since_eating: meal ? Math.round(Number(meal)) : null, optional_context: { ...(existing.optional_context ?? {}), note } });
        }
        else {
            await cloud.saveCheckIn({ owner_id: user.id, profile_id: profile.id, session_id: checkinSession.id, hunger_rating: rating, minutes_since_eating: meal ? Math.round(Number(meal)) : null, optional_context: { note } });
        } setCheckinSession(null); await refresh(); };
        return React.createElement(React.Fragment, null,
            React.createElement(DashboardNav, { tab: tab, setTab: setTab, onPublic: () => pushRoute('home'), onSignOut: onSignOut }),
            React.createElement("main", { id: "main-content", className: "mx-auto max-w-[1280px] px-4 pb-16 sm:px-6" },
                React.createElement("div", { className: "pt-7" },
                    React.createElement("div", { className: "flex flex-wrap items-start justify-between gap-4" },
                        React.createElement("div", null,
                            React.createElement("div", { className: "text-xs font-black uppercase tracking-[.17em] text-mint2" }, "Private dashboard"),
                            React.createElement("h1", { className: "mt-2 text-4xl font-black tracking-[-.05em] text-warm" },
                                "Welcome, ",
                                (user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'),
                                "."),
                            React.createElement("p", { className: "mt-2 text-slate2" }, "Record, review, and explore profile-separated research history.")),
                        React.createElement(DevicePill, { devices: devices }))),
                React.createElement(ProfileBar, { profiles: profiles, current: profile, onSwitch: requestSwitch, newName: newName, setNewName: setNewName, createProfile: () => setCreateProfileOpen(true), devices: devices }),
                error && React.createElement("div", { className: "mb-5 rounded-2xl border-l-4 border-coral bg-coral/10 p-4 text-sm text-[#62B5A6]", role: "alert" }, error),
                loading ? React.createElement(LoadingState, { label: "Loading your private MOM data\u2026" }) : React.createElement(React.Fragment, null,
                    tab === 'home' && React.createElement(DashboardHome, { profile: profile, sessions: sessions, checkins: checkins, devices: devices, preferences: preferences, setTab: setTab }),
                    tab === 'record' && React.createElement(RecordingFlow, { user: user, profile: profile, sessions: sessions, devices: devices, refresh: refresh, saveCheckin: saveCheckin, updateSession: updateSession }),
                    tab === 'sessions' && (profile ? React.createElement(SessionsView, { sessions: sessions, checkins: checkins, profileName: profile.display_name, onDelete: deleteSession, onAddCheckin: startCheckinForSession }) : React.createElement(EmptyState, { title: "Choose a profile", copy: "Sessions belong to one profile at a time." })),
                    tab === 'insights' && (profile ? React.createElement(InsightsView, { sessions: sessions, checkins: checkins }) : React.createElement(EmptyState, { title: "Choose a profile", copy: "Insights are built only from the selected profile\u2019s own history." })),
                    tab === 'preferences' && React.createElement(PreferencesView, { user: user, profile: profile, preferences: preferences, save: savePrefs, remove: removePrefs, onOpenDoorDash: setDoorDashIdea }),
                    tab === 'privacy' && React.createElement(PrivacyView, { profile: profile, profiles: profiles, onSwitch: requestSwitch, onCreate: () => setCreateProfileOpen(true), onGuest: () => pushRoute('guest'), onSessions: () => setTab('sessions'), exportData: exportData, onDeleteProfile: () => setDeleteProfileOpen(true), onSignOut: onSignOut }),
                    tab === 'device' && React.createElement(DeviceView, { user: user, profile: profile, devices: devices, sessions: sessions, refresh: refresh, cloud: cloud }),
                    tab === 'advanced' && React.createElement(AdvancedView, { sessions: sessions }))),
            pendingSwitch && React.createElement(Modal, { title: "Switch profiles?", onClose: () => setPendingSwitch(null) },
                React.createElement("p", { className: "text-slate2" }, "Switching profiles changes which private recordings, check-ins, preferences, and research history are visible. Data will not be mixed."),
                React.createElement("div", { className: "mt-6 flex gap-3" },
                    React.createElement(Button, { variant: "primary", onClick: confirmSwitch }, "Switch profile"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setPendingSwitch(null) }, "Cancel"))),
            createProfileOpen && React.createElement(Modal, { title: "Create a new profile", onClose: () => setCreateProfileOpen(false) },
                React.createElement("label", { className: "grid gap-2 text-sm font-bold text-warm" },
                    "Profile name",
                    React.createElement("input", { autoFocus: true, value: newName, onChange: e => setNewName(e.target.value), maxLength: 80, className: "min-h-11 rounded-xl border border-line bg-bg px-3" })),
                React.createElement("p", { className: "mt-3 text-sm text-slate2" }, "A new profile starts with its own empty recording, check-in, preference, and model history."),
                React.createElement("div", { className: "mt-6 flex gap-3" },
                    React.createElement(Button, { variant: "primary", onClick: create }, "Create profile"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setCreateProfileOpen(false) }, "Cancel"))),
            deleteProfileOpen && profile && React.createElement(Modal, { title: `Delete ${profile.display_name}?`, onClose: () => setDeleteProfileOpen(false) },
                React.createElement("p", { className: "text-slate2" }, "This permanently deletes this profile and linked data according to the cloud database relationships. This action cannot be undone."),
                React.createElement("div", { className: "mt-6 flex gap-3" },
                    React.createElement(Button, { variant: "danger", onClick: deleteProfile }, "Delete profile data"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setDeleteProfileOpen(false) }, "Cancel"))),
            doorDashIdea && React.createElement(Modal, { title: "Open in DoorDash?", onClose: () => setDoorDashIdea(null) },
                React.createElement("p", { className: "text-slate2" }, "You will leave MOM SenseLoop to review options on DoorDash. MOM SenseLoop will not place an order or send payment information."),
                React.createElement("div", { className: "mt-4 rounded-xl border border-line bg-bg/45 p-3 text-sm text-warm" },
                    "Preference match: ",
                    doorDashIdea),
                React.createElement("div", { className: "mt-6 flex gap-3" },
                    React.createElement(Button, { variant: "primary", onClick: () => { window.open('https://www.doordash.com/', '_blank', 'noopener,noreferrer'); setDoorDashIdea(null); } }, "Open in DoorDash"),
                    React.createElement(Button, { variant: "ghost", onClick: () => setDoorDashIdea(null) }, "Cancel"))),
            checkinSession && React.createElement(SessionCheckinModal, { session: checkinSession, existing: checkins.find(c => c.session_id === checkinSession.id), onClose: () => setCheckinSession(null), onSave: saveSessionCheckin }));
    }
    function SessionCheckinModal({ session, existing, onClose, onSave }) {
        const [share, setShare] = useState(existing?.hunger_rating !== null && existing?.hunger_rating !== undefined);
        const [rating, setRating] = useState(Number(existing?.hunger_rating ?? 5));
        const [meal, setMeal] = useState(existing?.minutes_since_eating != null ? String(existing.minutes_since_eating) : '');
        const [note, setNote] = useState(String(existing?.optional_context?.note ?? ''));
        const [saving, setSaving] = useState(false);
        return React.createElement(Modal, { title: "Add or edit optional check-in", onClose: onClose },
            React.createElement("p", { className: "text-sm text-slate2" },
                "Session: ",
                fmt(session.started_at),
                ". This self-report is optional and is not a medical assessment."),
            React.createElement("label", { className: "mt-5 flex items-center gap-2 text-sm text-slate2" },
                React.createElement("input", { type: "checkbox", checked: share, onChange: e => setShare(e.target.checked), className: "h-5 w-5 accent-[#62B5A6]" }),
                " Share an optional 0\u201310 self-rating"),
            share && React.createElement(React.Fragment, null,
                React.createElement("input", { type: "range", min: "0", max: "10", step: ".5", value: rating, onChange: e => setRating(Number(e.target.value)), className: "mt-4 w-full accent-[#62B5A6]" }),
                React.createElement("div", { className: "text-right text-sm font-bold text-warm" },
                    rating.toFixed(1),
                    " / 10")),
            React.createElement("label", { className: "mt-4 grid gap-2 text-sm font-bold text-warm" },
                "Approximate minutes since last meal",
                React.createElement("input", { type: "number", min: "0", max: "10080", value: meal, onChange: e => setMeal(e.target.value), className: "min-h-11 rounded-xl border border-line bg-bg px-3" })),
            React.createElement("label", { className: "mt-4 grid gap-2 text-sm font-bold text-warm" },
                "Optional note",
                React.createElement("textarea", { rows: 3, value: note, onChange: e => setNote(e.target.value), className: "rounded-xl border border-line bg-bg p-3" })),
            React.createElement("div", { className: "mt-6 flex gap-3" },
                React.createElement(Button, { variant: "primary", disabled: saving, onClick: async () => { setSaving(true); await onSave(share ? rating : null, meal, note); setSaving(false); } }, "Save check-in"),
                React.createElement(Button, { variant: "ghost", onClick: onClose }, "Cancel")));
    }
    function Footer() { return React.createElement("footer", { className: "site-footer" },
        React.createElement("strong", { className: "text-slate2" }, "MOM SenseLoop"),
        " \u00B7 Experimental research prototype \u00B7 Experimental pattern summary, not a medical conclusion."); }
    function App() {
        const [route, setRoute] = useState(readRoute());
        const [session, setSession] = useState(null);
        const authCallback = useMemo(() => location.hash.includes('access_token=') || new URLSearchParams(location.search).has('code'), []);
        const cloud = useMemo(() => { try {
            return new MOM.CloudService();
        }
        catch {
            return null;
        } }, []);
        const cloudError = cloud ? '' : 'Cloud client failed to load.';
        useEffect(() => { const h = () => setRoute(readRoute()); window.addEventListener('popstate', h); return () => window.removeEventListener('popstate', h); }, []);
        useEffect(() => { if (!cloud)
            return; let off = () => { }; (async () => { const s = await cloud.getSession(); setSession(s); if (s?.user && (readRoute().view === 'signin' || authCallback))
            pushRoute('dashboard', 'home', true); })(); off = cloud.onAuthChange((event, s) => { setSession(s); if (s?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && (readRoute().view === 'signin' || authCallback))
            pushRoute('dashboard', 'home', true); if (event === 'SIGNED_OUT')
            pushRoute('home', undefined, true); }); return () => off(); }, [cloud]);
        const privateGo = async () => { if (!cloud)
            return; if (session?.user)
            pushRoute('dashboard', 'home');
        else
            pushRoute('signin'); };
        const signOut = async () => { if (!cloud)
            return; await cloud.signOut(); setSession(null); pushRoute('home', undefined, true); };
        if (cloudError || !cloud)
            return React.createElement("main", { className: "grid min-h-screen place-items-center bg-bg p-6 text-center text-warm" },
                React.createElement("div", null,
                    React.createElement("h1", { className: "text-3xl font-black" }, "MOM SenseLoop"),
                    React.createElement("p", { className: "mt-3 text-slate2" }, "The secure cloud library could not load. Refresh the page on an internet connection.")));
        if (route.view === 'home')
            return React.createElement(PublicHome, { onPrivate: privateGo });
        if (route.view === 'how')
            return React.createElement(HowWorks, { onPrivate: privateGo });
        if (route.view === 'guest')
            return React.createElement(GuestMode, { onPrivate: privateGo });
        if (route.view === 'signin')
            return React.createElement(AuthScreen, { cloud: cloud, onBack: () => pushRoute('home') });
        if (route.view === 'dashboard')
            return session?.user ? React.createElement(Dashboard, { cloud: cloud, user: session.user, onSignOut: signOut }) : React.createElement(AuthScreen, { cloud: cloud, onBack: () => pushRoute('home') });
        return React.createElement(PublicHome, { onPrivate: privateGo });
    }
    const mount = document.getElementById('root');
    if (mount)
        ReactDOM.createRoot(mount).render(React.createElement(App, null));
})(MOM || (MOM = {}));
