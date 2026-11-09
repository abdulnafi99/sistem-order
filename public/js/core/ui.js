// Shared UI helpers: formatting, icons, toasts, modals, sheets, sound, QR, export.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const rm = (n) => `RM ${Number(n || 0).toFixed(2)}`;
export const num = (n) => Number(n || 0).toLocaleString('en-MY');

export function fmtDate(ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return ms ? new Date(ms).toLocaleDateString('en-MY', opts) : '—';
}
export function fmtTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }) : '—';
}
export const fmtDateTime = (ms) => (ms ? `${fmtDate(ms)}, ${fmtTime(ms)}` : '—');
export function timeAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
}
export function minutesSince(ms) { return Math.max(0, Math.floor((Date.now() - ms) / 60000)); }
export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const STATUS_LABEL = {
  received: 'Order Received', confirmed: 'Order Confirmed', preparing: 'Preparing', ready: 'Ready to Serve', completed: 'Completed', cancelled: 'Cancelled',
};
export const PAY_LABEL = { unpaid: 'Unpaid', pending_verification: 'Verifying', paid: 'Paid', refunded: 'Refunded' };
export const METHOD_LABEL = { cash: 'Cash', duitnow: 'DuitNow QR', online: 'Online Payment' };
export const TABLE_LABEL = { available: 'Available', occupied: 'Occupied', active_order: 'Has Active Order', waiting_payment: 'Waiting for Payment', cleaning: 'Cleaning' };

// ------------------------------------------------------------------ icons
const P = {
  cup: '<path d="M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H16.6"/><path d="M8.5 2.8c-.7 1 .7 1.8 0 2.8M12.5 2.8c-.7 1 .7 1.8 0 2.8"/><path d="M3.5 22h15"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  menu: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  utensils: '<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2.5 1-4 4-4 8h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  table: '<rect x="3" y="7" width="18" height="4" rx="1"/><path d="M6 11v9M18 11v9M9 4h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  staff: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/><path d="m15 14 2 2 4-4"/>',
  chef: '<path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V21H6z"/><path d="M6 17h12"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-8-5-13-3 2-6 6-6 9-1-1-2-3-2-3s-2 3-2 7c0 4 4 7 8 7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
};
export function icon(name, size = 20, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
}

// ------------------------------------------------------------------ toast
let toastHost;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toast-host'; toastHost.setAttribute('role', 'status'); document.body.appendChild(toastHost); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'info' : type === 'success' ? 'check' : 'bell', 18)}<span>${esc(message)}</span>`;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
export const errMsg = (e) => (e && e.message ? e.message.replace(/^.*?\] /, '') : 'Something went wrong');

// ------------------------------------------------------------------ modal / sheet
/**
 * openModal({ title, body (html), wide, sheet, onOpen(el, close), actions:[{label, cls, onClick(el, close)}] })
 * Returns { el, close }.
 */
export function openModal({ title = '', body = '', wide = false, sheet = false, actions = [], onOpen, onClose, cls = '' }) {
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${sheet ? 'is-sheet' : ''}`;
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${sheet ? '<div class="sheet-handle"></div>' : ''}
      ${title ? `<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>` : ''}
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-act="${i}" type="${a.submit ? 'submit' : 'button'}">${a.label}</button>`).join('')}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const prevFocus = document.activeElement;
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => { wrap.remove(); if (!document.querySelector('.modal-wrap')) document.body.classList.remove('no-scroll'); }, 220);
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = actions[Number(act.dataset.act)];
      if (a && a.onClick) {
        const r = a.onClick(wrap, close, act);
        if (r && r.then) { act.disabled = true; act.classList.add('loading'); r.finally(() => { act.disabled = false; act.classList.remove('loading'); }); }
      } else close();
    }
  });
  requestAnimationFrame(() => wrap.classList.add('show'));
  onOpen && onOpen(wrap, close);
  const first = wrap.querySelector('input, select, textarea');
  if (first && !sheet) setTimeout(() => first.focus(), 60);
  return { el: wrap, close };
}

export function confirmDialog(message, { title = 'Are you sure?', okLabel = 'Confirm', danger = false, input = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title,
      body: `<p class="muted">${esc(message)}</p>${input ? `<label class="field"><span>${esc(input)}</span><input class="input" id="confirm-input" /></label>` : ''}`,
      actions: [
        { label: 'Cancel', cls: 'btn-ghost', onClick: (el, close) => { close(); } },
        { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: (el, close) => { done = true; const v = el.querySelector('#confirm-input'); close(); resolve(input ? (v ? v.value : '') : true); } },
      ],
      onClose: () => { if (!done) resolve(input ? null : false); },
    });
  });
}

/** Read a <form> into a plain object (checkbox → boolean). */
export function formData(form) {
  const out = {};
  [...form.elements].forEach((el) => {
    if (!el.name) return;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  });
  return out;
}

// ------------------------------------------------------------------ sound
let audioCtx = null;
export function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { /* ignore */ }
  return audioCtx;
}
export function chime(kind = 'new') {
  const ctx = unlockAudio(); if (!ctx) return;
  const notes = kind === 'new' ? [880, 1174.7, 1568] : kind === 'ready' ? [1046.5, 1318.5] : [660];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.16;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.5);
  });
  if (navigator.vibrate) navigator.vibrate(kind === 'new' ? [120, 60, 120] : 80);
}

// ------------------------------------------------------------------ QR
/** Returns an SVG string of a QR code (requires /vendor/qrcode.js). */
export function qrSvg(text, { size = 220, margin = 2, dark = '#1D332B', light = '#ffffff' } = {}) {
  if (typeof window.qrcode !== 'function') return `<div class="muted">QR library not loaded</div>`;
  const qr = window.qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
export function svgToPng(svg, px = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, px, px); resolve(c.toDataURL('image/png')); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
export function downloadUrl(url, filename) {
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ export
export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Opens a print window (users choose "Save as PDF" for PDF export). */
export function printHtml(title, html, { width = null } = {}) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Please allow pop-ups to print / export PDF', 'error'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; ${width ? `size: ${width} auto;` : ''} }
    body{font-family:"Poppins",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1D332B;margin:0;padding:24px;font-size:13px}
    h1,h2,h3{font-family:"Cormorant Garamond",Georgia,serif;margin:0 0 6px} h1{font-size:24px}
    table{width:100%;border-collapse:collapse;margin:12px 0} th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e5e0d6;font-size:12px}
    th{background:#F5F0E7;text-transform:uppercase;letter-spacing:.06em;font-size:10px} td.r,th.r{text-align:right}
    .muted{color:#6b7a74}.row{display:flex;justify-content:space-between;gap:12px}.tot{font-weight:700;font-size:15px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.kpi{border:1px solid #e5e0d6;border-radius:10px;padding:10px}.kpi b{display:block;font-size:18px}
    .receipt{max-width:300px;margin:0 auto}.receipt td{border:0;padding:3px 0}.dash{border-top:1px dashed #999;margin:8px 0}
    .center{text-align:center} .brand{color:#344E41}
    @media print{.noprint{display:none}}
  </style></head><body>${html}<div class="noprint" style="margin-top:24px;text-align:center"><button onclick="print()" style="padding:10px 18px;border-radius:10px;border:0;background:#344E41;color:#fff;font-weight:600">Print / Save as PDF</button></div>
  <script>setTimeout(function(){window.print()},400)<\/script></body></html>`);
  w.document.close();
}

export function receiptHtml(order, settings = {}) {
  const lines = (order.items || []).map((l) => `<tr><td>${l.qty} × ${esc(l.name)}${l.variant ? `<br><span class="muted">${esc(l.variant.name)}</span>` : ''}${l.addons && l.addons.length ? `<br><span class="muted">+ ${l.addons.map((a) => esc(a.name)).join(', ')}</span>` : ''}</td><td class="r">${Number(l.lineTotal).toFixed(2)}</td></tr>`).join('');
  return `<div class="receipt">
    <div class="center"><h2 class="brand">${esc(settings.restaurantName || 'SELAGI COFFEE')}</h2>
    <div class="muted">${esc(settings.address || '')}<br>${esc(settings.phone || '')}</div></div>
    <div class="dash"></div>
    <table><tr><td>Order</td><td class="r"><b>${esc(order.orderNo)}</b></td></tr>
    <tr><td>${order.type === 'dine_in' ? 'Table' : 'Takeaway'}</td><td class="r">${esc(order.tableName || (order.pickup ? `${order.pickup.date} ${order.pickup.time}` : '-'))}</td></tr>
    <tr><td>Date</td><td class="r">${fmtDateTime(order.createdAt)}</td></tr>
    <tr><td>Customer</td><td class="r">${esc(order.customerName || 'Guest')}</td></tr></table>
    <div class="dash"></div><table>${lines}</table><div class="dash"></div>
    <table><tr><td>Subtotal</td><td class="r">${Number(order.subtotal).toFixed(2)}</td></tr>
    ${order.discount ? `<tr><td>Discount</td><td class="r">-${Number(order.discount).toFixed(2)}</td></tr>` : ''}
    ${order.serviceCharge ? `<tr><td>Service charge (${Math.round(order.serviceRate * 100)}%)</td><td class="r">${Number(order.serviceCharge).toFixed(2)}</td></tr>` : ''}
    ${order.tax ? `<tr><td>SST (${Math.round(order.taxRate * 100)}%)</td><td class="r">${Number(order.tax).toFixed(2)}</td></tr>` : ''}
    <tr class="tot"><td><b>TOTAL</b></td><td class="r"><b>RM ${Number(order.total).toFixed(2)}</b></td></tr>
    <tr><td>Payment</td><td class="r">${esc(METHOD_LABEL[order.paymentMethod] || order.paymentMethod)} · ${esc(PAY_LABEL[order.paymentStatus] || order.paymentStatus)}</td></tr>
    ${order.paymentRef ? `<tr><td>Ref</td><td class="r">${esc(order.paymentRef)}</td></tr>` : ''}</table>
    <div class="dash"></div><p class="center muted">Thank you & see you again!</p><p class="center muted" style="font-size:10px;margin-top:6px">Powered by TAPJERR.io</p></div>`;
}

// ------------------------------------------------------------------ misc
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'success'); } catch { toast(text); }
}
export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e)));
  }
}
export function hideSplash() {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 500); }
}
export function demoBanner(api) {
  if (api.mode !== 'demo' || sessionStorage.getItem('eh_demo_dismissed')) return '';
  return `<div class="demo-banner" id="demo-banner">${icon('info', 16)}<span><b>TAPJERR.io demo</b> – data is stored in this browser and syncs live between tabs. Configure Firebase for multi-device use.</span><button class="icon-btn sm" onclick="sessionStorage.setItem('eh_demo_dismissed',1);this.parentNode.remove()" aria-label="Dismiss">${icon('x', 14)}</button></div>`;
}

// ------------------------------------------------------------------ brand
/** TAPJERR.io platform name & mark (the café keeps its own logo via logoMark). */
export const PLATFORM = 'TAPJERR.io';
export function platformSvg() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="31" r="4.6" fill="currentColor"/><circle cx="50" cy="31" r="10.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="50" cy="31" r="16.5" fill="none" stroke="#C7A66A" stroke-width="1.6" opacity=".9"/><text x="50" y="68" text-anchor="middle" fill="currentColor" font-family="Poppins, Arial, sans-serif" font-size="16.5" font-weight="700" letter-spacing=".4">TAPJERR</text><text x="51" y="83" text-anchor="middle" fill="#C7A66A" font-family="Poppins, Arial, sans-serif" font-size="10" font-weight="600" letter-spacing="2.4">.IO</text></svg>`;
}
export function platformMark(size = 56, radius = null) {
  const r = radius == null ? Math.round(size * 0.26) : radius;
  return `<div class="logo-mark" style="width:${size}px;height:${size}px;border-radius:${r}px" aria-label="${PLATFORM}">${platformSvg()}</div>`;
}
export const poweredBy = (cls = '') => `<p class="powered-by ${cls}">Powered by <b>TAPJERR<span>.io</span></b></p>`;
export function logoSvg() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(50 29) rotate(-28)"><ellipse rx="8.5" ry="12.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M0.5 -12 C -5.5 -4 5.5 4 -0.5 12" fill="none" stroke="currentColor" stroke-width="2"/></g><text x="50" y="66" text-anchor="middle" fill="currentColor" font-family="Cormorant Garamond, Georgia, serif" font-size="21" font-weight="700" letter-spacing="1.2">SELAGI</text><path d="M31 72.5 H69" stroke="#C7A66A" stroke-width="1.2"/><text x="51.5" y="82.5" text-anchor="middle" fill="currentColor" font-family="Poppins, Arial, sans-serif" font-size="7.4" font-weight="500" letter-spacing="3.2">COFFEE</text></svg>`;
}
export function logoMark(settings, size = 56, radius = null) {
  const r = radius == null ? Math.round(size * 0.26) : radius;
  if (settings && settings.logo) return `<div class="logo-mark" style="width:${size}px;height:${size}px;border-radius:${r}px;overflow:hidden"><img src="${esc(settings.logo)}" alt="${esc(settings.restaurantName || 'SELAGI COFFEE')} logo" style="width:100%;height:100%;object-fit:contain"></div>`;
  return `<div class="logo-mark" style="width:${size}px;height:${size}px;border-radius:${r}px">${logoSvg()}</div>`;
}
