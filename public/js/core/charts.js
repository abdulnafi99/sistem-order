// Minimal dependency-free SVG charts (bar, line/area, donut, h-bars).
import { esc } from './ui.js';

const PALETTE = ['#075B46', '#D5B46A', '#3667b0', '#c2571a', '#6c4bd6', '#2a9b7a', '#95a19c', '#c0392b'];
export const chartColor = (i) => PALETTE[i % PALETTE.length];

const niceMax = (v) => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const fmtShort = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));

/** data: [{label, value, value2?}] */
export function barChart(data, { height = 240, color = '#075B46', color2 = null, prefix = '', showEvery = 1 } = {}) {
  const W = 640; const H = height; const pl = 44; const pb = 28; const pt = 14; const pr = 8;
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.value, d.value2 || 0)), 0));
  const cw = (W - pl - pr) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(34, cw * (color2 ? 0.36 : 0.6)));
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pl}" x2="${W - pr}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#E9ECE8"/><text x="${pl - 8}" y="${y(max * f) + 4}" text-anchor="end" font-size="11" fill="#95a19c">${prefix}${fmtShort(max * f)}</text>`).join('');
  const bars = data.map((d, i) => {
    const x = pl + cw * i + cw / 2;
    const b1 = `<rect x="${color2 ? x - bw - 1 : x - bw / 2}" y="${y(d.value)}" width="${bw}" height="${Math.max(0, H - pb - y(d.value))}" rx="${Math.min(6, bw / 2)}" fill="${color}"><title>${esc(d.label)}: ${prefix}${d.value.toFixed ? d.value.toFixed(2) : d.value}</title></rect>`;
    const b2 = color2 ? `<rect x="${x + 1}" y="${y(d.value2 || 0)}" width="${bw}" height="${Math.max(0, H - pb - y(d.value2 || 0))}" rx="${Math.min(6, bw / 2)}" fill="${color2}"><title>${esc(d.label)}: ${d.value2}</title></rect>` : '';
    const lbl = i % showEvery === 0 ? `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b7a74">${esc(d.label)}</text>` : '';
    return b1 + b2 + lbl;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" preserveAspectRatio="none" style="width:100%;height:${H}px">${grid}${bars}</svg>`;
}

export function lineChart(data, { height = 240, color = '#075B46', prefix = '', showEvery = 1 } = {}) {
  const W = 640; const H = height; const pl = 44; const pb = 28; const pt = 14; const pr = 12;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const step = (W - pl - pr) / Math.max(1, data.length - 1);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const pts = data.map((d, i) => [pl + step * i, y(d.value)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pl + step * (data.length - 1)} ${H - pb} L${pl} ${H - pb} Z`;
  const id = `g${Math.random().toString(36).slice(2, 7)}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pl}" x2="${W - pr}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#E9ECE8"/><text x="${pl - 8}" y="${y(max * f) + 4}" text-anchor="end" font-size="11" fill="#95a19c">${prefix}${fmtShort(max * f)}</text>`).join('');
  const labels = data.map((d, i) => (i % showEvery === 0 ? `<text x="${pl + step * i}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b7a74">${esc(d.label)}</text>` : '')).join('');
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(data[i].label)}: ${prefix}${data[i].value.toFixed ? data[i].value.toFixed(2) : data[i].value}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" preserveAspectRatio="none" style="width:100%;height:${H}px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#${id})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

/** segments: [{label, value, color?}] */
export function donutChart(segments, { size = 180, thickness = 26, center = '', sub = '' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s, i) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color || chartColor(i)}" stroke-width="${thickness}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${s.value}</title></circle>`;
    offset += len;
    return el;
  }).join('');
  const legend = segments.map((s, i) => `<div class="legend-row"><i style="background:${s.color || chartColor(i)}"></i><span>${esc(s.label)}</span><b>${Math.round((s.value / total) * 100)}%</b></div>`).join('');
  return `<div class="donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#F1F3F0" stroke-width="${thickness}"/>${arcs}
    <text x="50%" y="48%" text-anchor="middle" font-size="${String(center).length > 7 ? Math.max(11, Math.round(size / String(center).length / 1.05)) : 20}" font-weight="800" fill="#123D32">${esc(center)}</text><text x="50%" y="62%" text-anchor="middle" font-size="11" fill="#6b7a74">${esc(sub)}</text></svg><div class="legend">${legend}</div></div>`;
}

/** rows: [{label, value, sub?}] */
export function hBars(rows, { color = '#075B46', fmt = (v) => v } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="hbars">${rows.map((r, i) => `<div class="hbar"><div class="row between small"><span class="ellipsis"><b class="muted">${i + 1}.</b> ${esc(r.label)}</span><b>${esc(fmt(r.value))}</b></div><div class="hbar-track"><i style="width:${(r.value / max) * 100}%;background:${color}"></i></div>${r.sub ? `<div class="xs muted">${esc(r.sub)}</div>` : ''}</div>`).join('')}</div>`;
}
