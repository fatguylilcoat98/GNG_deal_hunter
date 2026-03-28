/*
  GNG Deal Hunter — app.js
  The Good Neighbor Guard · Truth · Safety · We Got Your Back
*/

// ─── STATE ────────────────────────────────────────────────
let currentFile  = null;
let lastExtracted = null;
let editMode     = false;

// ─── CLOCK ────────────────────────────────────────────────
(function clock() {
  const el = document.getElementById('header-clock');
  if (!el) return;
  function tick() {
    const d = new Date();
    el.textContent = d.toLocaleTimeString('en-US', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
})();

// ─── DOM ──────────────────────────────────────────────────
const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const previewWrap = document.getElementById('preview-wrap');
const previewImg  = document.getElementById('preview-img');
const btnAnalyze  = document.getElementById('btn-analyze');
const btnText     = document.getElementById('btn-text');
const btnSpinner  = document.getElementById('btn-spinner');
const errorBox    = document.getElementById('error-box');
const resultsDiv  = document.getElementById('results');
const uploadStatus = document.getElementById('upload-status');

// ─── FILE HANDLING ────────────────────────────────────────
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) setFile(f);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) setFile(f);
});

dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

function setFile(file) {
  currentFile = file;
  const url   = URL.createObjectURL(file);
  previewImg.src = url;
  previewWrap.style.display = 'block';
  dropZone.style.display    = 'none';
  btnAnalyze.disabled       = false;
  if (uploadStatus) uploadStatus.textContent = 'SCREENSHOT LOADED';
  hideError();
  setStep('extract');
}

function clearImage() {
  currentFile   = null;
  previewImg.src = '';
  previewWrap.style.display = 'none';
  dropZone.style.display    = '';
  fileInput.value = '';
  btnAnalyze.disabled = true;
  if (uploadStatus) uploadStatus.textContent = 'AWAITING INPUT';
  hideError();
  resultsDiv.style.display = 'none';
  setStep('upload');
}

// ─── PIPELINE ─────────────────────────────────────────────
const STEPS = ['upload', 'extract', 'compare', 'verdict'];

function setStep(step) {
  const idx = STEPS.indexOf(step);
  STEPS.forEach((s, i) => {
    const node = document.getElementById('pn-' + s);
    const fill = document.getElementById('pf-' + i); // pf-0 doesn't exist, that's ok
    if (!node) return;
    node.classList.remove('active', 'done');
    if      (i < idx) node.classList.add('done');
    else if (i === idx) node.classList.add('active');
  });

  // Fill connector tracks
  for (let i = 1; i <= 3; i++) {
    const pf = document.getElementById('pf-' + i);
    if (!pf) continue;
    if (i < idx) pf.classList.add('filled');
    else         pf.classList.remove('filled');
  }
}

// ─── ANALYZE ──────────────────────────────────────────────
async function runAnalysis() {
  if (!currentFile) return;

  setLoading(true);
  hideError();
  resultsDiv.style.display = 'none';
  setStep('extract');

  const fd = new FormData();
  fd.append('image', currentFile);

  try {
    const res  = await fetch('/api/analyze-listing', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showError(data.error || 'Analysis failed. Try a clearer screenshot.');
      setStep('upload');
      return;
    }

    setStep('compare');
    await sleep(400);
    setStep('verdict');

    lastExtracted = data.extracted;
    renderResults(data.extracted, data.valuation);

  } catch (err) {
    showError('Network error — check your connection and try again.');
    setStep('upload');
  } finally {
    setLoading(false);
  }
}

// ─── RENDER ───────────────────────────────────────────────
function renderResults(ext, val) {

  // ── Verdict reveal
  const reveal = document.getElementById('verdict-reveal');
  const vrIcon = document.getElementById('vr-icon');
  const vrWord = document.getElementById('vr-word');
  const vrSub  = document.getElementById('vr-sub');
  const vrConf = document.getElementById('vr-conf');

  const VM = {
    'FAIR':        { cls: 'v-fair',        icon: '✅', word: 'FAIR',        sub: 'This listing looks reasonably priced.' },
    'UNDERPRICED': { cls: 'v-underpriced', icon: '⚠️', word: 'UNDERPRICED', sub: 'Price is below expected range — worth investigating.' },
    'OVERPRICED':  { cls: 'v-overpriced',  icon: '🚫', word: 'OVERPRICED',  sub: 'Price is above expected range for this item.' },
    null:          { cls: 'v-unknown',     icon: '❓', word: 'NO PRICE',    sub: 'Enter the listed price below to get a verdict.' }
  };

  const v = VM[val.verdict] || VM[null];
  reveal.className = 'verdict-reveal ' + v.cls;
  vrIcon.textContent = v.icon;
  vrWord.textContent = v.word;
  vrSub.textContent  = v.sub;

  const confClass = { high: 'ch', medium: 'cm', low: 'cl' }[val.confidence] || 'cl';
  vrConf.textContent = (val.confidence || 'low').toUpperCase();
  vrConf.className   = 'vr-conf-badge ' + confClass;

  // ── Price compare
  const listed = ext.listed_price;
  document.getElementById('res-listed').textContent =
    listed != null ? '$' + Number(listed).toLocaleString() : '—';
  document.getElementById('res-range').textContent =
    '$' + val.low.toLocaleString() + ' – $' + val.high.toLocaleString();

  // ── Extracted fields
  document.getElementById('view-name').textContent  = ext.item_name || '—';
  document.getElementById('view-cat').textContent   = cap(ext.category);
  document.getElementById('view-cond').textContent  = cap(ext.condition);
  document.getElementById('view-price').textContent =
    listed != null ? '$' + Number(listed).toLocaleString() : 'Not detected — enter below';

  document.getElementById('view-desc').textContent = ext.short_description || '';

  // Signals
  const sw = document.getElementById('signals-wrap');
  sw.innerHTML = '';
  (ext.visible_signals || []).forEach(s => {
    const t = document.createElement('span');
    t.className   = 'signal-tag';
    t.textContent = s;
    sw.appendChild(t);
  });

  // ── Pre-fill edit fields
  document.getElementById('edit-price').value = listed != null ? listed : '';
  document.getElementById('edit-cat').value   = ext.category || 'other';
  document.getElementById('edit-cond').value  =
    (!ext.condition || ext.condition === 'unknown') ? 'fair' : ext.condition;

  // ── Risk note
  renderRisk(val.verdict, val.risk_note);

  // Show results
  resultsDiv.style.display = 'block';

  // Auto-open edit if price missing
  if (listed == null) openEdit(); else closeEdit();

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRisk(verdict, text) {
  const panel = document.getElementById('risk-panel');
  const icon  = document.getElementById('rp-icon') || document.getElementById('risk-icon');
  const msg   = document.getElementById('risk-text');

  const RM = {
    'FAIR':        { cls: 'r-safe',   icon: '✓' },
    'OVERPRICED':  { cls: 'r-warn',   icon: '💬' },
    'UNDERPRICED': { cls: 'r-danger', icon: '🚨' },
    null:          { cls: 'r-info',   icon: 'ℹ️' }
  };

  const r = RM[verdict] || RM[null];
  panel.className     = 'risk-panel ' + r.cls;
  if (icon) icon.textContent = r.icon;
  msg.textContent     = text || '';
}

// ─── EDIT / RE-VALUATION ──────────────────────────────────
function toggleEdit() {
  if (editMode) closeEdit(); else openEdit();
}

function openEdit() {
  editMode = true;
  document.getElementById('extracted-edit').style.display = 'block';
  document.getElementById('edit-toggle').textContent = '✕ CANCEL';
}

function closeEdit() {
  editMode = false;
  document.getElementById('extracted-edit').style.display = 'none';
  document.getElementById('edit-toggle').textContent = '✏️ EDIT';
}

async function applyEdits() {
  const price = document.getElementById('edit-price').value;
  const cat   = document.getElementById('edit-cat').value;
  const cond  = document.getElementById('edit-cond').value;

  try {
    const res  = await fetch('/api/revalue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listed_price: price ? parseFloat(price) : null,
        category: cat,
        condition: cond
      })
    });

    const data = await res.json();
    if (!data.success) { showError(data.error || 'Re-valuation failed.'); return; }

    const val = data.valuation;

    // Update displayed extracted values
    document.getElementById('view-cat').textContent  = cap(cat);
    document.getElementById('view-cond').textContent = cap(cond);
    document.getElementById('view-price').textContent =
      price ? '$' + parseFloat(price).toLocaleString() : 'Not entered';

    // Update price compare
    document.getElementById('res-listed').textContent =
      price ? '$' + parseFloat(price).toLocaleString() : '—';
    document.getElementById('res-range').textContent =
      '$' + val.low.toLocaleString() + ' – $' + val.high.toLocaleString();

    // Update verdict
    const reveal = document.getElementById('verdict-reveal');
    const VM = {
      'FAIR':        { cls: 'v-fair',        icon: '✅', word: 'FAIR',        sub: 'This listing looks reasonably priced.' },
      'UNDERPRICED': { cls: 'v-underpriced', icon: '⚠️', word: 'UNDERPRICED', sub: 'Price is below expected range.' },
      'OVERPRICED':  { cls: 'v-overpriced',  icon: '🚫', word: 'OVERPRICED',  sub: 'Price is above expected range.' },
      null:          { cls: 'v-unknown',     icon: '❓', word: 'NO PRICE',    sub: 'Enter price to get a verdict.' }
    };

    const v = VM[val.verdict] || VM[null];
    reveal.className = 'verdict-reveal ' + v.cls;
    document.getElementById('vr-icon').textContent = v.icon;
    document.getElementById('vr-word').textContent = v.word;
    document.getElementById('vr-sub').textContent  = v.sub;

    const confClass = { high: 'ch', medium: 'cm', low: 'cl' }[val.confidence] || 'cl';
    const vrConf = document.getElementById('vr-conf');
    vrConf.textContent = val.confidence.toUpperCase();
    vrConf.className   = 'vr-conf-badge ' + confClass;

    renderRisk(val.verdict, val.risk_note);
    closeEdit();
    hideError();

  } catch (err) {
    showError('Re-valuation failed — check your connection.');
  }
}

// ─── RESET ────────────────────────────────────────────────
function resetApp() {
  clearImage();
  resultsDiv.style.display = 'none';
  lastExtracted = null;
  closeEdit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── UTILS ────────────────────────────────────────────────
function setLoading(on) {
  btnAnalyze.disabled    = on;
  btnText.style.display  = on ? 'none' : 'inline';
  btnSpinner.style.display = on ? 'inline-block' : 'none';
}

function showError(msg) {
  errorBox.textContent   = '⚠ ' + msg;
  errorBox.style.display = 'block';
}

function hideError() {
  errorBox.style.display = 'none';
  errorBox.textContent   = '';
}

function cap(s) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
