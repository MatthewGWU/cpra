'use strict';

const LABELS = [
    'Notice_Requirement',
    'Right_to_Know',
    'Right_to_Delete',
    'Right_to_Correct',
    'Right_to_Opt_Out',
    'Right_to_Limit_Sensitive',
];

const SPLIT_NAMES = { train: 'Train', val: 'Validation', test: 'Test' };

const SHORT = {
    Notice_Requirement: 'Notice',
    Right_to_Know: 'Know',
    Right_to_Delete: 'Delete',
    Right_to_Correct: 'Correct',
    Right_to_Opt_Out: 'Opt out',
    Right_to_Limit_Sensitive: 'Limit',
};

const BADGE = {
    Notice_Requirement: 'bg-primary',
    Right_to_Know: 'bg-warning text-dark',
    Right_to_Delete: 'bg-danger',
    Right_to_Correct: 'bg-success',
    Right_to_Opt_Out: 'bg-secondary',
    Right_to_Limit_Sensitive: 'bg-info text-dark',
};

const PAGE_SIZE = 20;

const state = {
    active: null,
    cache: {},
    pages: { train: 1, val: 1, test: 1 },
    filters: { train: '', val: '', test: '' },
    charts: {},
    exploreRendered: false,
};

const SPLIT_DECISIONS = {
    train: [5016, 167, 248, 555, 96, 408],
    val: [1321, 41, 62, 110, 11, 88],
    test: [1362, 45, 76, 187, 16, 101],
};

const LABEL_TOTALS = LABELS.map((_, i) =>
    SPLIT_DECISIONS.train[i] + SPLIT_DECISIONS.val[i] + SPLIT_DECISIONS.test[i]);

const MODEL_SCORES = [
    { name: 'LegalBERT', f1: 0.7562 },
    { name: 'RoBERTa-large', f1: 0.7734 },
    { name: 'Flan-T5-base', f1: 0.7949 },
];

const BASELINE_SCORES = [
    { name: 'Always Notice', f1: 0.147 },
    { name: 'Always everything', f1: 0.224 },
];

const PER_LABEL = [
    { label: 'Notice_Requirement', support: 1362, f1: [0.96, 0.96, 0.97] },
    { label: 'Right_to_Know', support: 187, f1: [0.65, 0.68, 0.69] },
    { label: 'Right_to_Delete', support: 76, f1: [0.86, 0.88, 0.90] },
    { label: 'Right_to_Correct', support: 45, f1: [0.76, 0.84, 0.88] },
    { label: 'Right_to_Opt_Out', support: 101, f1: [0.90, 0.83, 0.89] },
    { label: 'Right_to_Limit_Sensitive', support: 16, f1: [0.40, 0.45, 0.43] },
];

const LABEL_COLOR = {
    Notice_Requirement: '#0d6efd',
    Right_to_Know: '#ffc107',
    Right_to_Delete: '#dc3545',
    Right_to_Correct: '#198754',
    Right_to_Opt_Out: '#6c757d',
    Right_to_Limit_Sensitive: '#0dcaf0',
};

function el(id) {
    return document.getElementById(id);
}

function esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

function badgeHtml(label) {
    return `<span class="badge ${BADGE[label] || 'bg-dark'} me-1">${esc(label)}</span>`;
}

/* ---------------------------------------------------------------- charts */

function valueLabelPlugin(format) {
    return {
        id: 'valueLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = '600 11px system-ui, sans-serif';
            ctx.fillStyle = '#33414f';
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (meta.hidden) return;
                meta.data.forEach((bar, i) => {
                    const text = format(ds.data[i]);
                    if (!text) return;
                    if (chart.options.indexAxis === 'y') {
                        ctx.fillText(text, bar.x + 6, bar.y + 4);
                    } else {
                        ctx.fillText(text, bar.x - ctx.measureText(text).width / 2, bar.y - 6);
                    }
                });
            });
            ctx.restore();
        },
    };
}

function renderLabelChart() {
    const canvas = el('label-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const plugin = valueLabelPlugin((v) => v.toLocaleString());
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: LABELS.map((l) => SHORT[l]),
            datasets: [{
                data: LABEL_TOTALS,
                backgroundColor: LABELS.map((l) => LABEL_COLOR[l]),
                borderRadius: 3,
                maxBarThickness: 20,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 54 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} passages` } },
            },
            scales: {
                x: { beginAtZero: true, ticks: { callback: (v) => v.toLocaleString() }, grid: { color: '#e9edf2' } },
                y: { ticks: { font: { size: 12 } }, grid: { display: false } },
            },
        },
        plugins: [plugin],
    });
}

function renderMiniSplitChart(split, maxShared) {
    const canvas = el('mini-' + split);
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: LABELS.map((l) => SHORT[l]),
            datasets: [{
                data: SPLIT_DECISIONS[split],
                backgroundColor: LABELS.map((l) => LABEL_COLOR[l]),
                borderRadius: 2,
                maxBarThickness: 12,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} passages` } },
            },
            scales: {
                x: { beginAtZero: true, max: maxShared, ticks: { display: false }, grid: { display: false } },
                y: { ticks: { font: { size: 10 } }, grid: { display: false } },
            },
        },
    });
}

function renderModelChart() {
    const canvas = el('model-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const rows = MODEL_SCORES.concat(BASELINE_SCORES);
    const plugin = valueLabelPlugin((v) => v.toFixed(4));
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map((r) => r.name),
            datasets: [{
                label: 'Macro F1 (test split)',
                data: rows.map((r) => r.f1),
                backgroundColor: rows.map((_, i) => (i < MODEL_SCORES.length ? '#1b4d89' : '#c3ccd8')),
                borderRadius: 4,
                maxBarThickness: 52,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` Macro F1: ${ctx.parsed.y.toFixed(4)}` } },
            },
            scales: {
                y: { beginAtZero: true, max: 0.9, ticks: { callback: (v) => v.toFixed(2) }, grid: { color: '#e9edf2' } },
                x: { ticks: { font: { size: 11 } }, grid: { display: false } },
            },
        },
        plugins: [plugin],
    });
}

function renderPerLabelTable() {
    const host = el('per-label-table');
    if (!host) return;
    const head = `<thead class="table-light"><tr>
        <th>Label</th><th>Test passages</th>
        <th>LegalBERT</th><th>RoBERTa-large</th><th>Flan-T5-base</th>
      </tr></thead>`;
    const body = PER_LABEL.map((r) => `<tr>
        <td><code class="small">${esc(r.label)}</code></td>
        <td>${r.support.toLocaleString()}</td>
        <td>${r.f1[0].toFixed(2)}</td>
        <td>${r.f1[1].toFixed(2)}</td>
        <td>${r.f1[2].toFixed(2)}</td>
      </tr>`).join('');
    host.innerHTML = `<table class="table table-sm table-bordered mb-0">${head}<tbody>${body}</tbody></table>`;
}

/* ------------------------------------------------------- passage browser */

async function fetchSplit(name) {
    if (!state.cache[name]) {
        const res = await fetch(`data/${name}.json`);
        if (!res.ok) throw new Error(`Could not load data/${name}.json (HTTP ${res.status})`);
        state.cache[name] = await res.json();
    }
    return state.cache[name];
}

function filteredRows(name) {
    const rows = state.cache[name];
    const q = state.filters[name].trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
        r.text.toLowerCase().includes(q) ||
        r.doc_id.toLowerCase().includes(q) ||
        r.labels.join(' ').toLowerCase().includes(q)
    );
}

function renderTable(name) {
    const rows = filteredRows(name);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.pages[name] > totalPages) state.pages[name] = totalPages;
    const start = (state.pages[name] - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    el(name + '-table-body').innerHTML = pageRows.map((r, i) => `
        <tr>
          <td class="text-muted align-top">${start + i + 1}</td>
          <td class="align-top">
            <div class="text-truncate sample-text" style="max-width: 460px; cursor: zoom-in;"
                 data-full="${esc(r.text)}" title="Click to expand">${esc(r.text)}</div>
          </td>
          <td class="align-top"><code class="small">${esc(r.doc_id)}</code></td>
          <td class="align-top">${r.labels.map(badgeHtml).join('')}</td>
        </tr>`).join('');

    el(name + '-page-info').textContent =
        `Showing ${rows.length ? start + 1 : 0} to ${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length.toLocaleString()} passages`;
    el(name + '-prev-btn').disabled = state.pages[name] <= 1;
    el(name + '-next-btn').disabled = state.pages[name] >= totalPages;
    el(name + '-page-pos').textContent = `Page ${state.pages[name]} of ${totalPages}`;
    el(name + '-total-pos').textContent = rows.length.toLocaleString();
}

function renderSplitHeader(name) {
    const rows = state.cache[name];
    const docs = new Set(rows.map((r) => r.doc_id)).size;
    const multi = rows.filter((r) => r.labels.length > 1).length;
    el(name + '-stat-passages').textContent = rows.length.toLocaleString();
    el(name + '-stat-docs').textContent = docs.toLocaleString();
    el(name + '-stat-multi').textContent = multi.toLocaleString();
}

async function renderSplit(name) {
    const content = el('split-' + name);
    if (!content) return;

    content.innerHTML = `<div class="text-muted small py-4 text-center">Loading ${SPLIT_NAMES[name].toLowerCase()} passages...</div>`;

    try {
        await fetchSplit(name);
    } catch (err) {
        content.innerHTML = `<div class="alert alert-warning mb-0"><strong>Could not load <code>data/${name}.json</code>.</strong>
            <div class="mt-1">${esc(err.message)}</div>
            <div class="mt-2">Fetch needs an HTTP server. Run <code>python -m http.server 8000</code> in this folder, then open <code>http://localhost:8000/</code>.</div></div>`;
        return;
    }

    content.innerHTML = `
      <div class="row text-center mb-3">
        <div class="col-4"><div class="fs-5 fw-bold">${SPLIT_NAMES[name]}</div></div>
        <div class="col-4"><div class="fs-5 fw-bold" id="${name}-stat-passages">0</div><div class="small text-muted">Passages</div></div>
        <div class="col-4"><div class="fs-5 fw-bold" id="${name}-stat-docs">0</div><div class="small text-muted">Companies</div></div>
      </div>
      <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <input type="search" id="${name}-filter-input" class="form-control form-control-sm" style="max-width: 320px;"
                 placeholder="Filter by text, company, or label...">
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted" id="${name}-total-pos"></span>
            <span class="small text-muted" id="${name}-page-pos"></span>
            <button id="${name}-prev-btn" class="btn btn-sm btn-outline-secondary">Prev</button>
            <button id="${name}-next-btn" class="btn btn-sm btn-outline-secondary">Next</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead><tr><th style="width:60px;">#</th><th>Passage</th><th style="width:130px;">Company</th><th style="width:300px;">Labels</th></tr></thead>
            <tbody id="${name}-table-body"></tbody>
          </table>
        </div>
        <div class="card-footer py-1 d-flex justify-content-between align-items-center small text-muted">
          <span id="${name}-page-info"></span>
          <span id="${name}-stat-multi-wrap">Multi-label passages: <span id="${name}-stat-multi">0</span></span>
        </div>
      </div>`;

    renderSplitHeader(name);
    renderTable(name);

    el(name + '-filter-input').addEventListener('input', (e) => {
        state.filters[name] = e.target.value;
        state.pages[name] = 1;
        renderTable(name);
    });
    el(name + '-prev-btn').addEventListener('click', () => {
        if (state.pages[name] > 1) { state.pages[name] -= 1; renderTable(name); }
    });
    el(name + '-next-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredRows(name).length / PAGE_SIZE);
        if (state.pages[name] < totalPages) { state.pages[name] += 1; renderTable(name); }
    });
    el(name + '-table-body').addEventListener('click', (e) => {
        const div = e.target.closest('.sample-text');
        if (!div) return;
        if (div.dataset.full === div.textContent) {
            div.textContent = div.dataset.full.slice(0, 120) + (div.dataset.full.length > 120 ? '...' : '');
            div.classList.add('text-truncate');
            div.title = 'Click to expand';
        } else {
            div.classList.remove('text-truncate');
            div.classList.add('text-wrap');
            div.textContent = div.dataset.full;
            div.title = 'Click to collapse';
        }
    });
}

function renderExplore() {
    if (state.exploreRendered) return;
    state.exploreRendered = true;
    ['train', 'val', 'test'].forEach(renderSplit);
}

/* -------------------------------------------------------- explainability */

function limeWordsHtml(lime) {
    if (!lime) return '';
    const all = Object.values(lime).flat().map((w) => Math.abs(w.weight));
    const max = Math.max(0.01, ...all);
    const groups = Object.entries(lime).filter(([, ws]) => ws.some((w) => w.weight !== 0));
    if (!groups.length) {
        return `<div class="small text-muted border-top pt-2">
          The model was already sure here, so the word bars collapse to zero. That is confidence, not an error.
        </div>`;
    }
    return `
      <div class="small border-top pt-2">
        <div class="fw-semibold mb-1">Words that pushed the decision:</div>
        <div class="d-flex align-items-center gap-2 text-muted mb-2 flex-wrap">
          <span class="d-inline-block" style="width:14px;height:8px;border-radius:2px;background:#198754;"></span> pushes toward the right
          <span class="d-inline-block" style="width:14px;height:8px;border-radius:2px;background:#dc3545;"></span> pushes away
          <span>longer bar, bigger effect</span>
        </div>
        ${groups.map(([label, ws]) => `
          <div class="mb-2">
            <div class="badge bg-light text-muted mb-1">${esc(label)}</div>
            ${ws.filter((w) => w.weight !== 0).slice(0, 4).map((w) => `
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="text-truncate small" style="width:110px;">${esc(w.word)}</span>
                <div class="flex-grow-1 bg-light rounded" style="height:10px;">
                  <div class="rounded ${w.weight >= 0 ? 'bg-success' : 'bg-danger'}"
                       title="${esc(w.word)} ${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(4)}"
                       style="height:10px; width:${Math.round((Math.abs(w.weight) / max) * 100)}%;"></div>
                </div>
                <span class="${w.weight >= 0 ? 'text-success' : 'text-danger'} small" style="width:56px; text-align:right;">${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(3)}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
}

function limeCardHtml(s) {
    return `
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header py-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span class="small fw-semibold">${esc(s.title)}</span>
            <span class="text-muted small">${esc(s.tag)}</span>
          </div>
          <div class="card-body">
            <div class="small text-muted mb-2">Question: ${esc(s.question)}</div>
            <p class="small text-muted">${esc(s.text)}</p>
            <div class="mb-2">${s.labels.map(badgeHtml).join(' ')}</div>
            <p class="small text-muted">${esc(s.note)}</p>
            ${limeWordsHtml(s.lime)}
          </div>
        </div>
      </div>`;
}

async function loadExplainability() {
    const container = el('explain-cards');
    if (!container) return;
    try {
        const res = await fetch('explainability/lime_samples.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        container.innerHTML = data.map(limeCardHtml).join('');
    } catch (err) {
        container.innerHTML = `<div class="col-12 text-muted small">Could not load the word breakdown: ${esc(err.message)}</div>`;
    }
}

/* ----------------------------------------------------------------- start */

document.addEventListener('DOMContentLoaded', () => {
    renderLabelChart();
    const sharedMax = Math.max(...LABEL_TOTALS);
    ['train', 'val', 'test'].forEach((s) => renderMiniSplitChart(s, sharedMax));
    renderModelChart();
    renderPerLabelTable();
    loadExplainability();

    const explore = el('explore-body');
    if (explore) explore.addEventListener('shown.bs.collapse', renderExplore);

    if (typeof bootstrap !== 'undefined') {
        document.querySelectorAll('.term-link').forEach((node) => {
            new bootstrap.Tooltip(node, { placement: 'top', container: 'body' });
        });
    }
});
