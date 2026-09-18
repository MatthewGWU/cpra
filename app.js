'use strict';

const LABELS = [
    'Notice_Requirement',
    'Right_to_Correct',
    'Right_to_Delete',
    'Right_to_Know',
    'Right_to_Limit_Sensitive',
    'Right_to_Opt_Out',
];

const SPLIT_NAMES = { train: 'Train', val: 'Validation', test: 'Test' };

const BADGE = {
    Notice_Requirement: 'bg-primary',
    Right_to_Correct: 'bg-success',
    Right_to_Delete: 'bg-danger',
    Right_to_Know: 'bg-warning text-dark',
    Right_to_Limit_Sensitive: 'bg-info text-dark',
    Right_to_Opt_Out: 'bg-secondary',
};

const PAGE_SIZE = 20;

const state = {
    active: null,
    cache: {},
    pages: { train: 1, val: 1, test: 1 },
    filters: { train: '', val: '', test: '' },
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

function labelCounts(rows) {
    const counts = {};
    for (const label of LABELS) counts[label] = 0;
    for (const r of rows) for (const label of r.labels) counts[label] += 1;
    return counts;
}

function renderLabelDist(name) {
    const rows = filteredRows(name);
    const counts = labelCounts(rows);
    const max = Math.max(1, ...Object.values(counts));
    el('dist-body').innerHTML = LABELS.map((label) => {
        const n = counts[label];
        const pct = Math.round((n / max) * 100);
        return `
        <div class="mb-2">
          <div class="d-flex justify-content-between small mb-1">
            <span class="text-truncate me-2">${esc(label)}</span>
            <span class="text-muted">${n.toLocaleString()}</span>
          </div>
          <div class="progress" style="height: 8px;">
            <div class="progress-bar ${BADGE[label].replace(' text-dark', '').replace('bg-warning', 'bg-warning')}"
                 role="progressbar" style="width: ${pct}%" title="${esc(label)}: ${n}"></div>
          </div>
        </div>`;
    }).join('');
}

function renderTable(name) {
    const rows = filteredRows(name);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.pages[name] > totalPages) state.pages[name] = totalPages;

    const start = (state.pages[name] - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    el('table-body').innerHTML = pageRows.map((r, i) => {
        const badges = r.labels.length ? r.labels.map(badgeHtml).join('') :
            '<span class="text-muted small">—</span>';
        return `
        <tr>
          <td class="text-muted align-top">${start + i + 1}</td>
          <td class="align-top">
            <div class="text-truncate sample-text" style="max-width: 420px; cursor: zoom-in;"
                 data-full="${esc(r.text)}" title="Click to expand">
              ${esc(r.text)}
            </div>
          </td>
          <td class="align-top"><code class="small">${esc(r.doc_id)}</code></td>
          <td class="align-top">${badges}</td>
        </tr>`;
    }).join('');

    el('page-info').textContent = `Showing ${rows.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length.toLocaleString()} spans`;
    el('prev-btn').disabled = state.pages[name] <= 1;
    el('next-btn').disabled = state.pages[name] >= totalPages;
    el('page-pos').textContent = `Page ${state.pages[name]} of ${totalPages}`;
    el('total-pos').textContent = rows.length.toLocaleString();
}

function renderSplitHeader(name) {
    const rows = state.cache[name];
    const docs = new Set(rows.map((r) => r.doc_id)).size;
    const multi = rows.filter((r) => r.labels.length > 1).length;

    el('split-title').textContent = `${SPLIT_NAMES[name]} set`;
    el('split-copy').innerHTML =
        `The <strong>${SPLIT_NAMES[name]}</strong> split: ${rows.length.toLocaleString()} spans from ` +
        `<strong>${docs.toLocaleString()}</strong> unique documents (${multi.toLocaleString()} multi-label spans). ` +
        `Filtered and paged from the JSON extracted from the notebook.`;

    el('stat-span').textContent = rows.length.toLocaleString();
    el('stat-doc').textContent = docs.toLocaleString();
    el('stat-multi').textContent = multi.toLocaleString();
}

async function showSplit(name) {
    state.active = name;
    document.querySelectorAll('.tab-split').forEach((b) => b.classList.toggle('active', b.dataset.split === name));

    const content = el('split-content');
    content.innerHTML = `
      <div class="d-none" id="split-loading">
        <div class="text-center text-muted py-5">
          <div class="spinner-border text-primary mb-3" role="status"></div>
          <div>Loading ${SPLIT_NAMES[name].toLowerCase()} split…</div>
        </div>
      </div>
      <div id="split-ready"></div>`;

    try {
        await fetchSplit(name);
    } catch (err) {
        content.innerHTML = `
          <div class="alert alert-warning mb-0">
            <strong>Could not load <code>data/${name}.json</code>.</strong>
            <div class="mt-1">${esc(err.message)}</div>
            <div class="mt-2">Fetch requires serving over HTTP. Run
            <code>python -m http.server 8000</code> in this folder, then open
            <code>http://localhost:8000/</code>.</div>
          </div>`;
        return;
    }

    el('split-loading').classList.remove('d-none');
    el('split-ready').innerHTML = `
      <div class="mb-3">
        <h5 class="mb-1" id="split-title"></h5>
        <p class="text-muted mb-0" id="split-copy"></p>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-span">0</div>
              <div class="text-muted small">Spans</div>
            </div>
          </div>
        </div>
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-doc">0</div>
              <div class="text-muted small">Documents</div>
            </div>
          </div>
        </div>
        <div class="col-4">
          <div class="card text-center h-100">
            <div class="card-body py-3">
              <div class="fs-4 fw-bold" id="stat-multi">0</div>
              <div class="text-muted small">Multi-label spans</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header">Label distribution <span class="text-muted fw-normal">(matching current filter)</span></div>
        <div class="card-body py-3" id="dist-body"></div>
      </div>

      <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="d-flex align-items-center gap-2">
            <input type="search" id="filter-input" class="form-control form-control-sm" style="max-width: 320px;"
                   placeholder="Filter by text, doc, or label…">
            <span class="small text-muted" id="total-pos"></span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="small text-muted" id="page-pos"></span>
            <button id="prev-btn" class="btn btn-sm btn-outline-secondary">Prev</button>
            <button id="next-btn" class="btn btn-sm btn-outline-secondary">Next</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style="width: 60px;">#</th>
                <th>Text span</th>
                <th style="width: 140px;">Document</th>
                <th style="width: 300px;">CPRA labels</th>
              </tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
        <div class="card-footer py-1 d-flex justify-content-between align-items-center small text-muted">
          <span id="page-info"></span>
          <span>${SPLIT_NAMES[name]} set</span>
        </div>
      </div>`;

    el('split-loading').classList.add('d-none');

    renderSplitHeader(name);
    renderLabelDist(name);
    renderTable(name);

    el('filter-input').addEventListener('input', (e) => {
        state.filters[name] = e.target.value;
        state.pages[name] = 1;
        renderLabelDist(name);
        renderTable(name);
    });
    el('prev-btn').addEventListener('click', () => {
        if (state.pages[name] > 1) { state.pages[name] -= 1; renderTable(name); }
    });
    el('next-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredRows(name).length / PAGE_SIZE);
        if (state.pages[name] < totalPages) { state.pages[name] += 1; renderTable(name); }
    });

    el('table-body').addEventListener('click', (e) => {
        const div = e.target.closest('.sample-text');
        if (!div) return;
        if (div.dataset.full === div.textContent) {
            div.textContent = div.dataset.full.slice(0, 120) + (div.dataset.full.length > 120 ? '…' : '');
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

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-split').forEach((btn) => {
        btn.addEventListener('click', () => showSplit(btn.dataset.split));
    });
});