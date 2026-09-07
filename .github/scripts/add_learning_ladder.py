from pathlib import Path

p = Path('docs/assets/app.js')
s = p.read_text()

def once(old, new, label):
    global s
    c = s.count(old)
    if c != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {c}')
    s = s.replace(old, new, 1)

# Route support.
once(
"        const view = raw === 'how' || raw === 'guest' || raw === 'signin' || raw === 'dashboard' ? raw : 'home';",
"        const view = raw === 'how' || raw === 'learn' || raw === 'guest' || raw === 'signin' || raw === 'dashboard' ? raw : 'home';",
'learn route parser')

# Desktop and mobile nav.
once(
"                    React.createElement(Button, { variant: \"ghost\", onClick: () => scrollPublicSection('how-it-works') }, \"How it works\"),",
"                    React.createElement(Button, { variant: \"ghost\", onClick: () => pushRoute('learn') }, \"Learn\"),\n                    React.createElement(Button, { variant: \"ghost\", onClick: () => scrollPublicSection('how-it-works') }, \"How it works\"),",
'desktop learn nav')
once(
"                    React.createElement(Button, { variant: \"ghost\", onClick: () => { setMobile(false); scrollPublicSection('how-it-works'); } }, \"How it works\"),",
"                    React.createElement(Button, { variant: \"ghost\", onClick: () => { setMobile(false); pushRoute('learn'); } }, \"Learn\"),\n                    React.createElement(Button, { variant: \"ghost\", onClick: () => { setMobile(false); scrollPublicSection('how-it-works'); } }, \"How it works\"),",
'mobile learn nav')

# Learning ladder component and full Learn page, inserted before PublicHome.
anchor = "    function PublicHome({ onPrivate }) {"
if s.count(anchor) != 1:
    raise SystemExit('PublicHome anchor mismatch')
insert = r'''    function LearningPath() {
        const levels = [
            ['01', 'Understand', 'No technical background needed', 'Learn what MOM is, what it physically does, and what it never claims.', 'Start here', () => pushRoute('learn')],
            ['02', 'Explore', 'See the science and engineering', 'Follow sound from the stethoscope and microphone through the ESP32, quality checks, and signal processing.', 'See how it works', () => pushRoute('how')],
            ['03', 'Verify', 'Audit the project', 'Open validation results, engineering iterations, limitations, reproducibility evidence, firmware, and source code.', 'Inspect the evidence', () => { location.href = 'engineering-validation.html'; }]
        ];
        return React.createElement("section", { id: "learning-path", className: "home-section", "aria-labelledby": "learning-path-heading" },
            React.createElement("div", { className: "section-intro" },
                React.createElement("p", { className: "eyebrow" }, "CHOOSE YOUR DEPTH"),
                React.createElement("h2", { id: "learning-path-heading" }, "Know nothing now. Leave knowing exactly as much as you want."),
                React.createElement("p", null, "MOM is explained in layers. Start with plain language, move into the engineering, then inspect the evidence and source if you want the full technical picture.")),
            React.createElement("div", { className: "grid gap-4 lg:grid-cols-3" }, levels.map(([n, title, meta, copy, cta, action]) =>
                React.createElement(Card, { key: n, className: "h-full" },
                    React.createElement("div", { className: "flex items-center justify-between gap-3" },
                        React.createElement("span", { className: "text-xs font-black tracking-[.18em] text-mint2" }, n),
                        React.createElement(Badge, { tone: n === '01' ? 'good' : 'neutral' }, meta)),
                    React.createElement("h3", { className: "mt-5 text-2xl font-black text-warm" }, title),
                    React.createElement("p", { className: "mt-3 text-sm leading-6 text-slate2" }, copy),
                    React.createElement(Button, { className: "mt-5", variant: n === '01' ? 'primary' : 'secondary', onClick: action }, cta, React.createElement(Icon, { name: "arrow-right" }))))));
    }

    function LearnPage({ onPrivate }) {
        const glossary = [
            ['Abdominal sound', 'A sound produced in or around the abdomen that can be captured from outside the body. MOM treats it as a research signal, not a diagnosis.'],
            ['Microphone amplifier', 'The MAX4466 boosts the tiny microphone signal enough for the ESP32 to measure it.'],
            ['Sampling', 'Turning a changing electrical signal into a sequence of numbers. The current research firmware targets 8,000 samples per second.'],
            ['Waveform', 'A picture of how the measured signal changes over time.'],
            ['Frequency', 'How quickly a sound pattern repeats. Signal processing can compare how much energy appears in different frequency ranges.'],
            ['Clipping', 'When the signal is too large for the recording range and gets distorted.'],
            ['Quality gate', 'Checks performed before a recording is treated as usable research data.'],
            ['Held-out evaluation', 'Testing on data kept separate from calibration or training so performance is not judged on the same examples used to tune the system.']
        ];
        const pipeline = [
            ['1', 'Sound reaches the sensor', 'A stethoscope-style acoustic interface couples quiet abdominal sound to a MAX4466 microphone amplifier.'],
            ['2', 'ESP32 measures the signal', 'The ESP32 digitizes the microphone output and packages a physical recording session.'],
            ['3', 'Quality is checked first', 'Completion, clipping, signal level, and other available engineering checks determine whether the session is usable.'],
            ['4', 'Signal features are calculated', 'The research workflow can analyze amplitude and frequency-domain properties instead of treating raw audio as a mysterious black box.'],
            ['5', 'Evidence stays profile-specific', 'Sessions, optional check-ins, preferences, and experimental history remain separated by profile.'],
            ['6', 'The interface may abstain', 'If support is weak or missing, MOM says there is not enough information rather than inventing a confident result.']
        ];
        return React.createElement(React.Fragment, null,
            React.createElement(PublicNav, { onPrivate }),
            React.createElement("main", { id: "main-content", className: "mx-auto max-w-[1180px] px-4 py-14 sm:px-6" },
                React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-4" },
                    React.createElement("div", null,
                        React.createElement(Badge, { tone: "good" }, "Beginner → Expert"),
                        React.createElement("h1", { className: "mt-5 max-w-4xl text-4xl font-black tracking-[-.05em] text-warm sm:text-5xl" }, "Learn MOM from zero background to full technical audit."),
                        React.createElement("p", { className: "mt-4 max-w-3xl text-lg leading-8 text-slate2" }, "You do not need biology, electronics, coding, or signal-processing knowledge to start. Each section gets more technical only when you choose to continue."))),
                React.createElement("section", { className: "mt-10" },
                    React.createElement(SectionTitle, { kicker: "LEVEL 1 · 20 SECONDS", title: "What is MOM?", copy: "MOM SenseLoop is an experimental research device that listens to quiet abdominal sounds from outside the body. A stethoscope-mounted microphone sends the signal to an ESP32, software checks whether the recording is usable, and the dashboard organizes recordings for research. It does not diagnose disease or objectively measure hunger." }),
                    React.createElement("div", { className: "grid gap-4 md:grid-cols-3" },
                        React.createElement(Card, null, React.createElement("strong", { className: "text-warm" }, "Physical device"), React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "Stethoscope-style coupling + MAX4466 microphone amplifier + ESP32.")),
                        React.createElement(Card, null, React.createElement("strong", { className: "text-warm" }, "Software"), React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "Guides recording, stores profile-separated sessions, checks quality, and presents research summaries.")),
                        React.createElement(Card, null, React.createElement("strong", { className: "text-warm" }, "Boundary"), React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "Research prototype only. No diagnosis, treatment, objective hunger measurement, or nutrition prescription."))),
                    React.createElement("div", { className: "mt-5 flex flex-wrap gap-3" },
                        React.createElement(Button, { variant: "primary", onClick: () => document.getElementById('learn-level-2')?.scrollIntoView({ behavior: 'smooth' }) }, "I understand. Go deeper"),
                        React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('guest') }, "Show me the demo"))),
                React.createElement("section", { id: "learn-level-2", className: "mt-14 scroll-mt-24" },
                    React.createElement(SectionTitle, { kicker: "LEVEL 2 · BEGINNER", title: "The words, translated.", copy: "Open any term. These definitions are intentionally plain before the technical version appears later." }),
                    React.createElement("div", { className: "grid gap-3 md:grid-cols-2" }, glossary.map(([term, definition]) =>
                        React.createElement("details", { key: term, className: "rounded-2xl border border-line bg-panel p-4" },
                            React.createElement("summary", { className: "cursor-pointer font-black text-warm focus-visible:ring-2 focus-visible:ring-mint" }, term),
                            React.createElement("p", { className: "mt-3 text-sm leading-6 text-slate2" }, definition))))),
                React.createElement("section", { className: "mt-14" },
                    React.createElement(SectionTitle, { kicker: "LEVEL 3 · EXPLORER", title: "Follow one recording through the whole system.", copy: "This is the complete logic chain without hiding the engineering behind a magic-AI box." }),
                    React.createElement("div", { className: "grid gap-3" }, pipeline.map(([n, title, copy]) =>
                        React.createElement(Card, { key: n, className: "p-4" },
                            React.createElement("div", { className: "grid gap-3 sm:grid-cols-[48px_220px_1fr] sm:items-center" },
                                React.createElement("span", { className: "grid h-10 w-10 place-items-center rounded-full bg-mint/10 font-black text-mint2" }, n),
                                React.createElement("strong", { className: "text-warm" }, title),
                                React.createElement("span", { className: "text-sm leading-6 text-slate2" }, copy))))),
                    React.createElement(Button, { className: "mt-5", variant: "secondary", onClick: () => pushRoute('how') }, "Open technical How MOM Works")),
                React.createElement("section", { className: "mt-14" },
                    React.createElement(SectionTitle, { kicker: "LEVEL 4 · TECHNICAL", title: "What an engineer should inspect.", copy: "At this level, the important question is no longer ‘what does it do?’ but ‘how was each claim measured, constrained, and tested?’" }),
                    React.createElement("div", { className: "grid gap-4 lg:grid-cols-3" }, [
                        ['Acquisition', 'GPIO32 ADC input, physical microphone coupling, target sampling behavior, clipping and completeness checks.'],
                        ['Signal processing', 'Amplitude and spectral features, fixed analysis rules, source separation, and uncertainty boundaries.'],
                        ['System architecture', 'Browser → Supabase command → ESP32 poll → physical capture → authenticated session upload → profile-scoped review.']
                    ].map(([title, copy]) => React.createElement(Card, { key: title }, React.createElement("h3", { className: "font-black text-warm" }, title), React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, copy))))),
                React.createElement("section", { className: "mt-14" },
                    React.createElement(SectionTitle, { kicker: "LEVEL 5 · VERIFY", title: "Do not just trust the explanation. Audit it.", copy: "The deepest layer contains the engineering history, validation results, limitations, reproducibility material, and source code." }),
                    React.createElement("div", { className: "grid gap-4 md:grid-cols-2" },
                        React.createElement(Card, null,
                            React.createElement("h3", { className: "text-xl font-black text-warm" }, "Engineering evidence"),
                            React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "V1 → V3 iteration, controlled tests, independent operators, reviewers, external-corpus results, failed replications, and documented limitations."),
                            React.createElement("a", { href: "engineering-validation.html", className: "ui-button ui-button--primary mt-5" }, "Open engineering evidence")),
                        React.createElement(Card, null,
                            React.createElement("h3", { className: "text-xl font-black text-warm" }, "Source and reproducibility"),
                            React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "Inspect the firmware, signal-processing code, validation scripts, generated reports, and repository history directly."),
                            React.createElement("a", { href: "https://github.com/neelesh-kotte/moms-device-v2-signal-processing", target: "_blank", rel: "noopener noreferrer", className: "ui-button ui-button--secondary mt-5" }, "Open source repository"))),
                    React.createElement("div", { className: "mt-6 rounded-2xl border border-amber/30 bg-amber/5 p-5" },
                        React.createElement("strong", { className: "text-warm" }, "Expert boundary"),
                        React.createElement("p", { className: "mt-2 text-sm leading-6 text-slate2" }, "The project distinguishes verified software/build behavior from physical measurements that still require hardware testing. A compiled firmware build is not treated as proof of exact real-world sampling timing or physiological validity."))),
                React.createElement("div", { className: "mt-14 flex flex-wrap gap-3 border-t border-line pt-8" },
                    React.createElement(Button, { variant: "primary", onClick: () => pushRoute('guest') }, "Explore the demo"),
                    React.createElement(Button, { onClick: onPrivate }, "Open dashboard"),
                    React.createElement(Button, { variant: "ghost", onClick: () => pushRoute('home') }, "Back to public home"))),
            React.createElement(Footer, null));
    }

'''
s = s.replace(anchor, insert + anchor, 1)

# Homepage ladder right after hero, before how-it-works.
once(
"                    React.createElement(HeroVisual, null)),\n                React.createElement(FeatureGrid, null),",
"                    React.createElement(HeroVisual, null)),\n                React.createElement(LearningPath, null),\n                React.createElement(FeatureGrid, null),",
'homepage learning ladder')

# Hero gets a clear beginner CTA.
once(
"                            React.createElement(Button, { variant: \"ghost\", onClick: () => scrollPublicSection('how-it-works') }, \"See how it works\")),",
"                            React.createElement(Button, { variant: \"ghost\", onClick: () => pushRoute('learn') }, \"Start from zero\"),\n                            React.createElement(Button, { variant: \"ghost\", onClick: () => scrollPublicSection('how-it-works') }, \"See how it works\")),",
'hero beginner CTA')

# HowWorks points both upward and downward in depth.
once(
"                    React.createElement(\"a\", { href: \"engineering-validation.html\", className: \"ui-button ui-button--secondary\" }, \"Open engineering evidence\"))),",
"                    React.createElement(Button, { variant: \"ghost\", onClick: () => pushRoute('learn') }, \"Back to beginner guide\"),\n                    React.createElement(\"a\", { href: \"engineering-validation.html\", className: \"ui-button ui-button--secondary\" }, \"Open engineering evidence\"))),",
'HowWorks ladder link')

# App route rendering.
once(
"        if (route.view === 'how')\n            return React.createElement(HowWorks, { onPrivate: privateGo });",
"        if (route.view === 'how')\n            return React.createElement(HowWorks, { onPrivate: privateGo });\n        if (route.view === 'learn')\n            return React.createElement(LearnPage, { onPrivate: privateGo });",
'LearnPage render')

p.write_text(s)
print('Learning ladder patch applied successfully.')
