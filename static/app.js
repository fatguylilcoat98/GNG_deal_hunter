/*
  GNG Deal Hunter — app.js
  Multi-image batch analysis · Ranked results · PDF save
  The Good Neighbor Guard · Truth · Safety · We Got Your Back
*/

// ─── STATE ────────────────────────────────────────────────
let queue       = [];   // Array of { file, id, objectUrl, result }
let results     = [];   // Completed analysis results
let sortMode    = 'deal';
let isRunning   = false;
let nextId      = 0;

const MAX_FILES = 10;

// ─── CLOCK ────────────────────────────────────────────────
(function clock() {
  const el = document.getElementById('header-clock');
  if (!el) return;
  function tick() { el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false }); }
  tick(); setInterval(tick, 1000);
})();

// ─── DOM ──────────────────────────────────────────────────
const fileInput    = document.getElementById('file-input');
const dropZone     = document.getElementById('drop-zone');
const queueWrap    = document.getElementById('queue-wrap');
const queueList    = document.getElementById('queue-list');
const queueLabel   = document.getElementById('queue-label');
const btnAnalyze   = document.getElementById('btn-analyze');
const btnText      = document.getElementById('btn-text');
const btnSpinner   = document.getElementById('btn-spinner');
const errorBox     = document.getElementById('error-box');
const resultsDiv   = document.getElementById('results');
const resultsList  = document.getElementById('results-list');
const uploadStatus = document.getElementById('upload-status');

// ─── FILE HANDLING ────────────────────────────────────────
fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
});
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

function addFiles(files) {
  const slots = MAX_FILES - queue.length;
  if (slots <= 0) { showError(`Max ${MAX_FILES} screenshots at once.`); return; }
  files = files.slice(0, slots);
  files.forEach(file => {
    const id  = nextId++;
    const url = URL.createObjectURL(file);
    queue.push({ file, id, objectUrl: url, result: null });
    renderQueueItem({ file, id, objectUrl: url });
  });
  updateQueueUI();
  hideError();
  fileInput.value = '';
}

function renderQueueItem(item) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.id = `qi-${item.id}`;
  div.innerHTML = `
    <img class="qi-thumb" src="${item.objectUrl}" alt=""/>
    <div class="qi-info">
      <div class="qi-name">${item.file.name}</div>
      <div class="qi-status" id="qi-status-${item.id}">QUEUED</div>
      <div class="qi-progress"><div class="qi-progress-fill" id="qi-prog-${item.id}"></div></div>
    </div>
    <button class="qi-remove" onclick="removeFromQueue(${item.id})" title="Remove">✕</button>`;
  queueList.appendChild(div);
}

function removeFromQueue(id) {
  const idx = queue.findIndex(q => q.id === id);
  if (idx === -1) return;
  URL.revokeObjectURL(queue[idx].objectUrl);
  queue.splice(idx, 1);
  document.getElementById(`qi-${id}`)?.remove();
  updateQueueUI();
}

function updateQueueUI() {
  const count = queue.length;
  queueWrap.style.display   = count > 0 ? 'block' : 'none';
  dropZone.style.display    = count >= MAX_FILES ? 'none' : '';
  btnAnalyze.disabled       = count === 0;
  if (queueLabel) queueLabel.textContent = `${count} LISTING${count !== 1 ? 'S' : ''} QUEUED`;
  if (uploadStatus) uploadStatus.textContent = count > 0 ? `${count} READY` : 'AWAITING INPUT';
  if (count > 0) setStep('extract'); else setStep('upload');
}

function clearQueue() {
  queue.forEach(q => URL.revokeObjectURL(q.objectUrl));
  queue = [];
  queueList.innerHTML = '';
  updateQueueUI();
  dropZone.style.display = '';
  fileInput.value = '';
  hideError();
  setStep('upload');
}

// ─── PIPELINE ─────────────────────────────────────────────
const STEPS = ['upload','extract','compare','verdict'];
function setStep(step) {
  const idx = STEPS.indexOf(step);
  STEPS.forEach((s, i) => {
    const node = document.getElementById('pn-' + s);
    const fill = document.getElementById('pf-' + i);
    if (!node) return;
    node.classList.remove('active','done');
    if      (i < idx)  node.classList.add('done');
    else if (i === idx) node.classList.add('active');
    if (fill) { if (i < idx) fill.classList.add('filled'); else fill.classList.remove('filled'); }
  });
}

// ─── BATCH RUN ────────────────────────────────────────────
async function runBatch() {
  if (!queue.length || isRunning) return;
  isRunning = true;
  results   = [];
  setLoading(true);
  hideError();
  resultsDiv.style.display = 'none';
  setStep('extract');

  for (const item of queue) {
    const el     = document.getElementById(`qi-${item.id}`);
    const status = document.getElementById(`qi-status-${item.id}`);
    if (el)     el.classList.add('qi-processing');
    if (status) { status.textContent = 'ANALYZING...'; status.className = 'qi-status s-processing'; }

    try {
      const fd = new FormData();
      fd.append('image', item.file);
      const res  = await fetch('/api/analyze-listing', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        item.result = data;
        results.push({ ...data, id: item.id, objectUrl: item.objectUrl, filename: item.file.name });
        if (el)     { el.classList.remove('qi-processing'); el.classList.add('qi-done'); }
        if (status) { status.textContent = '✓ ' + (data.valuation.verdict || 'ANALYZED'); status.className = 'qi-status s-done'; }
      } else {
        if (el)     { el.classList.remove('qi-processing'); el.classList.add('qi-error'); }
        if (status) { status.textContent = '✗ ' + (data.error || 'Failed'); status.className = 'qi-status s-error'; }
      }
    } catch (err) {
      if (el)     { el.classList.remove('qi-processing'); el.classList.add('qi-error'); }
      if (status) { status.textContent = '✗ Network error'; status.className = 'qi-status s-error'; }
    }

    // Small pause between calls
    await sleep(300);
  }

  setStep('verdict');
  setLoading(false);
  isRunning = false;

  if (results.length === 0) {
    showError('No listings could be analyzed. Check your screenshots and try again.');
    return;
  }

  renderBatchSummary();
  sortResults(sortMode);
  resultsDiv.style.display = 'block';
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── SUMMARY BAR ──────────────────────────────────────────
function renderBatchSummary() {
  document.getElementById('bs-count').textContent = results.length;

  const withDeals   = results.filter(r => r.valuation.deal_score != null);
  const withResell  = results.filter(r => r.valuation.resell_score != null);
  const underpriced = results.filter(r => r.valuation.verdict === 'UNDERPRICED').length;

  const bestDeal   = withDeals.length   ? Math.max(...withDeals.map(r => r.valuation.deal_score))   : null;
  const bestResell = withResell.length  ? Math.max(...withResell.map(r => r.valuation.resell_score)) : null;

  document.getElementById('bs-best-deal').textContent   = bestDeal   != null ? bestDeal   : '—';
  document.getElementById('bs-best-resell').textContent = bestResell != null ? bestResell : '—';
  document.getElementById('bs-underpriced').textContent = underpriced;
}

// ─── SORT & RENDER ────────────────────────────────────────
function sortResults(mode) {
  sortMode = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sort-' + mode)?.classList.add('active');

  const sorted = [...results].sort((a, b) => {
    if (mode === 'deal')   return (b.valuation.deal_score   ?? -1) - (a.valuation.deal_score   ?? -1);
    if (mode === 'resell') return (b.valuation.resell_score ?? -1) - (a.valuation.resell_score ?? -1);
    if (mode === 'price') {
      const pa = a.extracted.listed_price ?? Infinity;
      const pb = b.extracted.listed_price ?? Infinity;
      return pa - pb;
    }
    return 0;
  });

  resultsList.innerHTML = '';
  sorted.forEach((r, idx) => renderResultCard(r, idx + 1));
}

// ─── RESULT CARD ──────────────────────────────────────────
function renderResultCard(r, rank) {
  const ext  = r.extracted;
  const val  = r.valuation;
  const card = document.createElement('div');

  const verdictClass = verdictCls(val.verdict);
  const rankClass    = rank <= 3 ? `rank-${rank}` : '';

  card.className = `result-card rc-${verdictClass}`;
  card.id = `rc-${r.id}`;

  const dealScore   = val.deal_score   ?? '—';
  const resellScore = val.resell_score ?? '—';
  const listedFmt   = ext.listed_price != null ? '$' + Number(ext.listed_price).toLocaleString() : '—';
  const rangeFmt    = `$${val.low.toLocaleString()} – $${val.high.toLocaleString()}`;
  const resellFmt   = val.resell_low != null ? `$${val.resell_low.toLocaleString()} – $${val.resell_high.toLocaleString()}` : '—';

  const riskCls  = { 'FAIR': 'r-safe', 'UNDERPRICED': 'r-danger', 'OVERPRICED': 'r-warn' }[val.verdict] || 'r-safe';
  const riskIcon = { 'FAIR': '✓', 'UNDERPRICED': '🚨', 'OVERPRICED': '💬' }[val.verdict] || 'ℹ️';

  card.innerHTML = `
    <div class="rc-header" onclick="toggleCard(${r.id})">
      <div class="rc-rank ${rankClass}">#${rank}</div>
      <img class="rc-thumb" src="${r.objectUrl}" alt=""/>
      <div class="rc-info">
        <div class="rc-name">${ext.item_name || 'Unknown Item'}</div>
        <div class="rc-meta">${cap(ext.category)} &nbsp;·&nbsp; ${cap(ext.condition)} &nbsp;·&nbsp; ${listedFmt}</div>
      </div>
      <div class="rc-scores">
        <div class="rc-score">
          <div class="rc-score-val deal-score">${dealScore}</div>
          <div class="rc-score-label">DEAL</div>
        </div>
        <div class="rc-score">
          <div class="rc-score-val resell-score">${resellScore}</div>
          <div class="rc-score-label">RESELL</div>
        </div>
      </div>
      <div class="rc-verdict-badge vb-${verdictClass}">${val.verdict || 'NO PRICE'}</div>
      <div class="rc-chevron" id="chev-${r.id}">▾</div>
    </div>
    <div class="rc-body" id="rcb-${r.id}">
      <!-- Score bars -->
      <div style="padding-top:16px">
        <div class="score-bar-wrap">
          <div class="score-bar-label">DEAL</div>
          <div class="score-bar-track"><div class="score-bar-fill deal" style="width:${dealScore === '—' ? 0 : dealScore}%"></div></div>
          <div class="score-bar-num deal">${dealScore}</div>
        </div>
        <div class="score-bar-wrap" style="margin-top:6px">
          <div class="score-bar-label">RESELL</div>
          <div class="score-bar-track"><div class="score-bar-fill resell" style="width:${resellScore === '—' ? 0 : resellScore}%"></div></div>
          <div class="score-bar-num resell">${resellScore}</div>
        </div>
      </div>

      <!-- Price row -->
      <div class="rc-price-row">
        <div class="rc-price-box">
          <div class="rpb-label">LISTED PRICE</div>
          <div class="rpb-val">${listedFmt}</div>
        </div>
        <div class="rc-price-box accent">
          <div class="rpb-label">FAIR RANGE</div>
          <div class="rpb-val">${rangeFmt}</div>
        </div>
        <div class="rc-price-box">
          <div class="rpb-label">RESELL EST.</div>
          <div class="rpb-val" style="color:var(--teal)">${resellFmt}</div>
        </div>
      </div>

      <!-- Data grid -->
      <div class="rc-data-grid">
        <div class="rdc"><div class="rdc-label">ITEM</div><div class="rdc-val">${ext.item_name || '—'}</div></div>
        <div class="rdc"><div class="rdc-label">CATEGORY</div><div class="rdc-val">${cap(ext.category)}</div></div>
        <div class="rdc"><div class="rdc-label">CONDITION</div><div class="rdc-val">${cap(ext.condition)}</div></div>
        <div class="rdc"><div class="rdc-label">CONFIDENCE</div><div class="rdc-val">${cap(val.confidence)}</div></div>
      </div>

      ${ext.short_description ? `<div class="rc-desc">${ext.short_description}</div>` : ''}

      ${ext.visible_signals?.length ? `
        <div class="rc-signals">
          ${ext.visible_signals.map(s => `<span class="signal-tag">${s}</span>`).join('')}
        </div>` : ''}

      <!-- Risk note -->
      <div class="rc-risk ${riskCls}">
        <span>${riskIcon}</span>
        <span>${val.risk_note || ''}</span>
      </div>

      <!-- Edit zone -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <button class="rc-edit-toggle" onclick="toggleCardEdit(${r.id})" id="rc-edit-btn-${r.id}">✏️ EDIT</button>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-dim)">Correct extraction if needed</span>
      </div>
      <div class="rc-edit-zone" id="rc-edit-${r.id}">
        <div class="edit-grid">
          <div class="field-group">
            <label>PRICE ($)</label>
            <input type="number" id="ep-${r.id}" value="${ext.listed_price ?? ''}" placeholder="0" min="0" step="0.01"/>
          </div>
          <div class="field-group">
            <label>CATEGORY</label>
            <select id="ec-${r.id}">${catOptions(ext.category)}</select>
          </div>
          <div class="field-group">
            <label>CONDITION</label>
            <select id="ecn-${r.id}">${condOptions(ext.condition)}</select>
          </div>
        </div>
        <button class="btn-revalue" onclick="revalueCard(${r.id})">↻ RE-RUN</button>
      </div>

      <!-- Save individual PDF -->
      <button class="rc-save-btn" onclick="saveItemPDF(${r.id})" style="margin-top:4px">📄 SAVE THIS LISTING AS PDF</button>
    </div>`;

  resultsList.appendChild(card);
}

function toggleCard(id) {
  const body = document.getElementById(`rcb-${id}`);
  const chev = document.getElementById(`chev-${id}`);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', open);
}

function toggleCardEdit(id) {
  const zone = document.getElementById(`rc-edit-${id}`);
  const btn  = document.getElementById(`rc-edit-btn-${id}`);
  if (!zone) return;
  const open = zone.classList.toggle('open');
  if (btn) btn.textContent = open ? '✕ CANCEL' : '✏️ EDIT';
}

async function revalueCard(id) {
  const price = parseFloat(document.getElementById(`ep-${id}`)?.value) || null;
  const cat   = document.getElementById(`ec-${id}`)?.value  || 'other';
  const cond  = document.getElementById(`ecn-${id}`)?.value || 'fair';

  try {
    const res  = await fetch('/api/revalue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listed_price: price, category: cat, condition: cond })
    });
    const data = await res.json();
    if (!data.success) { showError(data.error); return; }

    // Update result in memory
    const idx = results.findIndex(r => r.id === id);
    if (idx !== -1) {
      results[idx].valuation = data.valuation;
      results[idx].extracted.listed_price = price;
      results[idx].extracted.category     = cat;
      results[idx].extracted.condition    = cond;
    }
    renderBatchSummary();
    sortResults(sortMode);
  } catch (err) {
    showError('Re-valuation failed.');
  }
}

// ─── PDF: SINGLE ITEM ─────────────────────────────────────
async function saveItemPDF(id) {
  const r = results.find(r => r.id === id);
  if (!r) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  await buildItemPDF(doc, r, 0);
  const name = (r.extracted.item_name || 'listing').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  doc.save(`GNG_Deal_Hunter_${name}.pdf`);
}

// ─── PDF: ALL ITEMS ───────────────────────────────────────
async function saveAllPDF() {
  if (!results.length) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  // Sort same as current view
  const sorted = [...results].sort((a, b) => {
    if (sortMode === 'deal')   return (b.valuation.deal_score   ?? -1) - (a.valuation.deal_score   ?? -1);
    if (sortMode === 'resell') return (b.valuation.resell_score ?? -1) - (a.valuation.resell_score ?? -1);
    if (sortMode === 'price') {
      return (a.extracted.listed_price ?? Infinity) - (b.extracted.listed_price ?? Infinity);
    }
    return 0;
  });

  // Cover page
  buildCoverPage(doc, sorted);

  for (let i = 0; i < sorted.length; i++) {
    doc.addPage();
    await buildItemPDF(doc, sorted[i], i + 1);
  }

  const ts = new Date().toISOString().slice(0, 10);
  doc.save(`GNG_Deal_Hunter_Report_${ts}.pdf`);
}

function buildCoverPage(doc, sorted) {
  const W = doc.internal.pageSize.getWidth();
  let y = 60;

  // Header
  doc.setFillColor(6, 12, 24);
  doc.rect(0, 0, W, 120, 'F');

  doc.setTextColor(0, 210, 180);
  doc.setFontSize(28); doc.setFont('helvetica', 'bold');
  doc.text('GNG DEAL HUNTER', W / 2, y, { align: 'center' });
  y += 28;
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 150, 180);
  doc.text('THE GOOD NEIGHBOR GUARD  ·  TRUTH · SAFETY · WE GOT YOUR BACK', W / 2, y, { align: 'center' });
  y += 16;
  doc.text(`Report generated: ${new Date().toLocaleString()}  ·  ${sorted.length} listings analyzed`, W / 2, y, { align: 'center' });

  y = 150;
  doc.setTextColor(40, 60, 90);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('LISTINGS RANKED BY ' + sortMode.toUpperCase(), 40, y);
  y += 24;

  // Summary table header
  const cols = [40, 200, 310, 380, 440, 500];
  doc.setFillColor(14, 26, 46);
  doc.rect(30, y - 14, W - 60, 20, 'F');
  doc.setFontSize(9); doc.setTextColor(0, 210, 180);
  ['#', 'ITEM', 'VERDICT', 'PRICE', 'DEAL', 'RESELL'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 8;

  sorted.forEach((r, idx) => {
    const ext = r.extracted; const val = r.valuation;
    if (y > 700) { doc.addPage(); y = 60; }

    doc.setFillColor(idx % 2 === 0 ? 10 : 14, idx % 2 === 0 ? 18 : 24, idx % 2 === 0 ? 34 : 44);
    doc.rect(30, y - 12, W - 60, 18, 'F');

    const vColor = { 'FAIR': [57,255,158], 'UNDERPRICED': [255,183,0], 'OVERPRICED': [255,77,106] }[val.verdict] || [150,180,200];
    doc.setTextColor(200, 220, 240); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(String(idx + 1), cols[0], y);
    doc.text((ext.item_name || '—').slice(0, 28), cols[1], y);
    doc.setTextColor(...vColor);
    doc.text(val.verdict || '—', cols[2], y);
    doc.setTextColor(200, 220, 240);
    doc.text(ext.listed_price != null ? '$' + Number(ext.listed_price).toLocaleString() : '—', cols[3], y);
    doc.setTextColor(57, 255, 158);
    doc.text(val.deal_score != null ? String(val.deal_score) : '—', cols[4], y);
    doc.setTextColor(0, 210, 180);
    doc.text(val.resell_score != null ? String(val.resell_score) : '—', cols[5], y);
    y += 18;
  });
}

async function buildItemPDF(doc, r, rank) {
  const W   = doc.internal.pageSize.getWidth();
  const ext = r.extracted;
  const val = r.valuation;
  let y = 40;

  const vColor = { 'FAIR': [57,255,158], 'UNDERPRICED': [255,183,0], 'OVERPRICED': [255,77,106] }[val.verdict] || [0,210,180];

  // Dark header bar
  doc.setFillColor(6, 12, 24);
  doc.rect(0, 0, W, 90, 'F');

  if (rank) {
    doc.setTextColor(100, 150, 180); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`RANK #${rank}`, 40, y); y += 18;
  }

  doc.setTextColor(0, 210, 180); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('GNG DEAL HUNTER', 40, y); y += 20;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 150, 180);
  doc.text(`The Good Neighbor Guard  ·  ${new Date().toLocaleString()}`, 40, y);

  y = 110;

  // Item name + verdict
  doc.setTextColor(230, 240, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text((ext.item_name || 'Unknown Item').slice(0, 50), 40, y); y += 26;

  doc.setTextColor(...vColor); doc.setFontSize(24); doc.setFont('helvetica', 'bold');
  doc.text(val.verdict || 'NO VERDICT', 40, y);
  if (val.deal_score != null) {
    doc.setFontSize(11); doc.setTextColor(57,255,158);
    doc.text(`Deal Score: ${val.deal_score}`, 200, y - 10);
    doc.setTextColor(0,210,180);
    doc.text(`Resell Score: ${val.resell_score}`, 200, y + 6);
  }
  y += 36;

  // Price boxes
  doc.setFillColor(14, 26, 46);
  doc.roundedRect(30, y, 150, 52, 4, 4, 'F');
  doc.setTextColor(100,150,180); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('LISTED PRICE', 40, y + 16);
  doc.setTextColor(230,240,255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(ext.listed_price != null ? '$' + Number(ext.listed_price).toLocaleString() : '—', 40, y + 38);

  doc.setFillColor(10, 30, 50);
  doc.roundedRect(196, y, 160, 52, 4, 4, 'F');
  doc.setTextColor(100,150,180); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('FAIR RANGE', 206, y + 16);
  doc.setTextColor(0,210,180); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(`$${val.low.toLocaleString()} – $${val.high.toLocaleString()}`, 206, y + 38);

  doc.setFillColor(10, 30, 50);
  doc.roundedRect(372, y, 160, 52, 4, 4, 'F');
  doc.setTextColor(100,150,180); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('RESELL EST.', 382, y + 16);
  doc.setTextColor(0,210,180); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  const resellStr = val.resell_low != null ? `$${val.resell_low.toLocaleString()} – $${val.resell_high.toLocaleString()}` : '—';
  doc.text(resellStr, 382, y + 38);

  y += 70;

  // Details
  doc.setFillColor(11, 21, 37);
  doc.roundedRect(30, y, W - 60, 66, 4, 4, 'F');
  const details = [
    ['CATEGORY', cap(ext.category)], ['CONDITION', cap(ext.condition)],
    ['CONFIDENCE', cap(val.confidence)], ['FILE', r.filename?.slice(0,30) || '—']
  ];
  details.forEach(([label, val2], i) => {
    const x = 40 + (i % 2) * 240;
    const dy = y + 20 + Math.floor(i / 2) * 28;
    doc.setFontSize(8); doc.setTextColor(100,150,180); doc.setFont('helvetica','normal');
    doc.text(label, x, dy);
    doc.setFontSize(11); doc.setTextColor(230,240,255); doc.setFont('helvetica','bold');
    doc.text(val2, x, dy + 14);
  });
  y += 82;

  // Description
  if (ext.short_description) {
    doc.setFontSize(10); doc.setFont('helvetica','italic'); doc.setTextColor(140,170,200);
    const lines = doc.splitTextToSize(ext.short_description, W - 80);
    doc.text(lines, 40, y); y += lines.length * 14 + 10;
  }

  // Risk note
  const rBg = { 'FAIR': [20,50,30], 'UNDERPRICED': [50,35,10], 'OVERPRICED': [50,20,20] }[val.verdict] || [20,35,50];
  doc.setFillColor(...rBg);
  const rLines = doc.splitTextToSize('⚠ ' + (val.risk_note || ''), W - 100);
  doc.roundedRect(30, y, W - 60, rLines.length * 14 + 20, 4, 4, 'F');
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(...vColor);
  doc.text(rLines, 44, y + 16); y += rLines.length * 14 + 30;

  // Footer
  doc.setDrawColor(0, 210, 180); doc.setLineWidth(0.5);
  doc.line(30, y, W - 30, y); y += 14;
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,110,140);
  doc.text('GNG Deal Hunter — Version A  ·  The Good Neighbor Guard  ·  Sacramento, CA  ·  Always verify before you buy.', 40, y);
}

// ─── RESET ────────────────────────────────────────────────
function resetApp() {
  clearQueue();
  results = [];
  resultsList.innerHTML = '';
  resultsDiv.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── UTILS ────────────────────────────────────────────────
function setLoading(on) {
  btnAnalyze.disabled      = on;
  btnText.style.display    = on ? 'none' : 'inline';
  btnSpinner.style.display = on ? 'inline-block' : 'none';
  if (!on) btnText.textContent = '⚡ ANALYZE ALL LISTINGS';
}

function showError(msg) { errorBox.textContent = '⚠ ' + msg; errorBox.style.display = 'block'; }
function hideError()    { errorBox.style.display = 'none'; errorBox.textContent = ''; }

function cap(s) { if (!s) return '—'; return s.charAt(0).toUpperCase() + s.slice(1); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function verdictCls(v) {
  return { 'FAIR': 'fair', 'UNDERPRICED': 'underpriced', 'OVERPRICED': 'overpriced' }[v] || 'fair';
}

function catOptions(selected) {
  const cats = ['laptop','phone','tv','bike','couch','table','chair','dresser','appliance','other'];
  const labels = { laptop:'Laptop', phone:'Phone / Smartphone', tv:'TV / Monitor', bike:'Bike', couch:'Couch / Sofa', table:'Table / Desk', chair:'Chair', dresser:'Dresser', appliance:'Appliance', other:'Other' };
  return cats.map(c => `<option value="${c}"${c===selected?' selected':''}>${labels[c]}</option>`).join('');
}

function condOptions(selected) {
  const conds = ['excellent','good','fair','poor','unknown'];
  const labels = { excellent:'Excellent / Like New', good:'Good', fair:'Fair', poor:'Poor / For Parts', unknown:'Unknown' };
  return conds.map(c => `<option value="${c}"${c===selected?' selected':''}>${labels[c]}</option>`).join('');
}
