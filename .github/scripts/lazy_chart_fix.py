from pathlib import Path

app_path = Path('docs/assets/app.js')
index_path = Path('docs/index.html')
app = app_path.read_text()

old = '''    function TimelineChart({ checkins }) {
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
'''
new = '''    function ensureChartJs() {
        if (window.Chart) return Promise.resolve(window.Chart);
        if (window.__momChartPromise) return window.__momChartPromise;
        window.__momChartPromise = new Promise((resolve, reject) => {
            const existing = document.getElementById('mom-chartjs-script');
            if (existing) {
                existing.addEventListener('load', () => resolve(window.Chart), { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.id = 'mom-chartjs-script';
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => window.Chart ? resolve(window.Chart) : reject(new Error('Chart library loaded without a Chart global.'));
            script.onerror = () => reject(new Error('Chart library could not load.'));
            document.head.appendChild(script);
        });
        return window.__momChartPromise;
    }
    function TimelineChart({ checkins }) {
        const ref = useRef(null), chart = useRef(null);
        const points = [...checkins].filter(c => c.hunger_rating !== null && c.hunger_rating !== undefined).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        useEffect(() => {
            let cancelled = false;
            if (!ref.current || !points.length) return;
            (async () => {
                try {
                    await ensureChartJs();
                    if (cancelled || !ref.current || !window.Chart) return;
                    chart.current?.destroy?.();
                    chart.current = new window.Chart(ref.current, {
                        type: 'line',
                        data: { labels: points.map(c => fmtShort(c.created_at)), datasets: [{ label: 'Optional self-reported rating', data: points.map(c => Number(c.hunger_rating)), borderColor: '#2F6B5F', backgroundColor: 'rgba(47,107,95,.10)', pointBackgroundColor: '#2F6B5F', tension: .25, fill: true }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#19251F' } } }, scales: { x: { ticks: { color: '#647069' }, grid: { color: 'rgba(208,202,189,.55)' } }, y: { min: 0, max: 10, ticks: { color: '#647069' }, grid: { color: 'rgba(208,202,189,.55)' } } } }
                    });
                } catch (_) {}
            })();
            return () => { cancelled = true; chart.current?.destroy?.(); };
        }, [checkins.length]);
'''
count = app.count(old)
if count != 1:
    raise SystemExit(f'TimelineChart block expected once, found {count}')
app = app.replace(old, new, 1)
app_path.write_text(app)

index = index_path.read_text()
line = '    <script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" crossorigin></script>\n'
if line not in index:
    raise SystemExit('Chart.js script tag not found in index')
index = index.replace(line, '')
index = index.replace('assets/app.js?v=audit-20260907-4', 'assets/app.js?v=audit-20260907-5')
index_path.write_text(index)
