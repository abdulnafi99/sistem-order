// Lightweight illustrated food art (SVG) used for demo menu items when no
// photo has been uploaded yet. Admins replace these by uploading real photos.

const wrap = (bg, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs><radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
<radialGradient id="pl" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e4dc"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#1D332B" flood-opacity=".25"/></filter></defs>
<rect width="200" height="200" fill="url(#bg)"/>${inner}</svg>`;

const plate = (dark = false) => dark
  ? '<circle cx="100" cy="104" r="78" fill="#1f2a27" filter="url(#sh)"/><circle cx="100" cy="104" r="62" fill="#2a3633"/>'
  : '<circle cx="100" cy="104" r="78" fill="url(#pl)" filter="url(#sh)"/><circle cx="100" cy="104" r="62" fill="none" stroke="#e2dbd0" stroke-width="2"/>';

const greens = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="14" ry="7" fill="#4c8b3f" transform="rotate(-25)"/><ellipse cx="8" cy="4" rx="12" ry="6" fill="#6fae4f" transform="rotate(20)"/><circle cx="-6" cy="6" r="4" fill="#d9443a"/></g>`;
const fries = (x, y) => `<g transform="translate(${x} ${y})">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${i * 6 - 18}" y="${-(i % 3) * 4}" width="5" height="34" rx="2" fill="${i % 2 ? '#f2c14e' : '#e8ac2c'}" transform="rotate(${(i - 3) * 9})"/>`).join('')}</g>`;

const ART = {
  burger: () => plate(true) + fries(140, 110) + `
    <ellipse cx="88" cy="128" rx="40" ry="10" fill="#c9822f"/>
    <rect x="48" y="108" width="80" height="16" rx="8" fill="#5a2e1a"/>
    <path d="M46 106 q42 10 84 0 l-4 8 q-38 8 -76 0z" fill="#f4c430"/>
    <path d="M50 100 q38 10 76 0 q2 6 -2 8 q-36 6 -72 0z" fill="#5fae3c"/>
    <path d="M50 98 q38-48 76 0z" fill="#d48a3a"/>
    ${[60, 74, 88, 102, 114].map((x, i) => `<ellipse cx="${x}" cy="${80 + (i % 2) * 6}" rx="2.4" ry="1.4" fill="#fff4d6"/>`).join('')}`,
  pasta: () => plate() + `
    <ellipse cx="100" cy="104" rx="50" ry="42" fill="#f3d27a"/>
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${62 + i * 9} ${80 + (i % 3) * 4} q20 ${18 + i} ${-6 + (i % 4) * 6} ${44 - (i % 3) * 6}" stroke="#e9b949" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}
    <circle cx="86" cy="96" r="7" fill="#e86a5a"/><circle cx="114" cy="112" r="7" fill="#e86a5a"/><circle cx="104" cy="88" r="5" fill="#f08a7a"/>
    ${greens(122, 86)}`,
  steak: () => plate(true) + `
    <path d="M58 92 q10-26 50-22 q34 4 36 30 q2 30-40 34 q-52 2-46-42z" fill="#6b3b26"/>
    <path d="M66 96 q12-18 42-16 q26 4 28 24" stroke="#8a4e33" stroke-width="5" fill="none"/>
    ${[0, 1, 2, 3].map((i) => `<line x1="${72 + i * 16}" y1="86" x2="${86 + i * 16}" y2="122" stroke="#3d1f12" stroke-width="3" opacity=".6"/>`).join('')}
    <circle cx="140" cy="80" r="12" fill="#8a5a2b"/><circle cx="140" cy="80" r="8" fill="#a97139"/>
    ${greens(70, 140)}<rect x="104" y="134" width="40" height="5" rx="2" fill="#5f9a3b" transform="rotate(-12 124 136)"/><rect x="104" y="142" width="40" height="5" rx="2" fill="#6fae4f" transform="rotate(-8 124 144)"/>`,
  chicken: () => plate(true) + fries(146, 112) + `
    <path d="M52 100 q4-30 40-30 q38 0 40 28 q2 32-40 36 q-42 2-40-34z" fill="#c76a2a"/>
    ${Array.from({ length: 14 }, (_, i) => `<circle cx="${62 + (i * 13) % 62}" cy="${82 + Math.floor(i / 5) * 14}" r="4" fill="#e08a3c"/>`).join('')}
    <circle cx="74" cy="142" r="12" fill="#5a3a24"/><circle cx="74" cy="142" r="8" fill="#7a4e30"/>${greens(108, 64)}`,
  nasi: () => plate() + `
    <path d="M70 70 a30 30 0 0 1 60 0 v18 h-60z" fill="#fbf7ef" stroke="#eee5d6"/>
    <ellipse cx="100" cy="88" rx="30" ry="6" fill="#f5efe4"/>
    <circle cx="66" cy="120" r="16" fill="#fff"/><circle cx="66" cy="120" r="8" fill="#f2b632"/>
    <path d="M100 116 q20-10 40 0 q-4 18-20 18 q-16 0-20-18z" fill="#c8361f"/>
    <rect x="112" y="80" width="30" height="8" rx="3" fill="#8b5a2b" transform="rotate(20 127 84)"/>
    ${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${88 + i * 7}" cy="${140 + (i % 2) * 3}" rx="3.5" ry="2" fill="#c98f4a"/>`).join('')}
    <path d="M128 132 l14 -4 l2 10 l-14 4z" fill="#6fae4f"/>`,
  noodle: () => plate(true) + `
    <circle cx="100" cy="104" r="52" fill="#8a3b1c"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M${58 + i * 11} 84 q14 20 0 40" stroke="#f0c46a" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}
    <circle cx="84" cy="90" r="9" fill="#f6efe2"/><circle cx="84" cy="90" r="5" fill="#f2b632"/>
    <path d="M110 96 q10-8 22 0 q-10 10-22 0z" fill="#f08a5a"/>${greens(118, 124)}`,
  fries: () => plate() + fries(84, 96) + fries(118, 100) + '<circle cx="100" cy="146" r="13" fill="#f7f0de" stroke="#e5dccb"/><circle cx="100" cy="146" r="8" fill="#c8361f"/>',
  fishchips: () => plate() + fries(130, 96) + `
    <path d="M50 116 q14-30 52-22 q16 4 18 16 q-6 18-30 20 q-30 2-40-14z" fill="#d99a44"/>
    ${Array.from({ length: 10 }, (_, i) => `<circle cx="${62 + i * 5}" cy="${104 + (i % 3) * 6}" r="3" fill="#eab35c"/>`).join('')}
    <path d="M60 140 a10 10 0 0 1 20 0z" fill="#f4e04d"/><circle cx="96" cy="146" r="10" fill="#f7f0de" stroke="#e5dccb"/>`,
  salad: () => plate() + `
    ${[[80, 90], [110, 84], [96, 112], [124, 110], [74, 120], [104, 132]].map(([x, y]) => greens(x, y)).join('')}
    <circle cx="94" cy="98" r="6" fill="#f4e7c6"/><circle cx="118" cy="122" r="6" fill="#f4e7c6"/>`,
  toast: () => plate() + `
    <rect x="58" y="70" width="74" height="70" rx="16" fill="#d7a35c" transform="rotate(-8 95 105)"/>
    <rect x="64" y="76" width="62" height="58" rx="12" fill="#f0c98a" transform="rotate(-8 95 105)"/>
    <ellipse cx="92" cy="104" rx="20" ry="16" fill="#fffaf0"/><circle cx="94" cy="104" r="8" fill="#f2a71b"/>
    <path d="M118 120 q12-6 24 4" stroke="#7d9d4a" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  cake: () => plate() + `
    <path d="M70 120 l30-46 l34 46z" fill="#f6e4c8"/><path d="M70 120 l30-46 l34 46 v14 h-64z" fill="#5b2f1d"/>
    <rect x="70" y="120" width="64" height="5" fill="#f6e4c8"/><rect x="70" y="128" width="64" height="4" fill="#7a432a"/>
    <circle cx="100" cy="72" r="8" fill="#c8202f"/><path d="M100 64 q4-8 10-8" stroke="#3f7a2f" stroke-width="2" fill="none"/>
    <path d="M140 140 q10-8 20 0" stroke="#5b2f1d" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  waffle: () => plate() + `
    <rect x="60" y="70" width="80" height="70" rx="12" fill="#e2a64d"/>
    ${[0, 1, 2, 3].map((i) => `<line x1="${76 + i * 16}" y1="72" x2="${76 + i * 16}" y2="138" stroke="#c98a32" stroke-width="4"/><line x1="62" y1="${86 + i * 14}" x2="138" y2="${86 + i * 14}" stroke="#c98a32" stroke-width="4"/>`).join('')}
    <circle cx="100" cy="98" r="16" fill="#fff8ec"/><circle cx="112" cy="90" r="6" fill="#c8202f"/><circle cx="90" cy="108" r="5" fill="#3b5ba5"/>`,
  coffee: (tone = '#6b3f26') => `<ellipse cx="100" cy="150" rx="62" ry="16" fill="#e9e1d4" filter="url(#sh)"/>
    <path d="M58 82 h84 l-8 62 q-2 10-14 10 h-40 q-12 0-14-10z" fill="#ffffff" filter="url(#sh)"/>
    <path d="M142 96 q22 0 20 20 q-2 18-24 18" stroke="#ffffff" stroke-width="9" fill="none"/>
    <ellipse cx="100" cy="84" rx="42" ry="10" fill="${tone}"/>
    <path d="M90 84 q10-10 20 0 q-10 8-20 0z" fill="#f3e3c8" opacity=".9"/><path d="M96 84 q4-4 8 0" stroke="${tone}" stroke-width="2" fill="none"/>
    <path d="M84 60 q-6-10 2-18 M100 56 q-6-10 2-18 M116 60 q-6-10 2-18" stroke="#ffffff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`,
  iced: (tone = '#7a4a2a', top = '#efe2cc') => `<ellipse cx="100" cy="160" rx="44" ry="10" fill="#1D332B" opacity=".15"/>
    <path d="M66 52 h68 l-8 104 q-1 8-10 8 h-32 q-9 0-10-8z" fill="#ffffff" opacity=".55" stroke="#ffffff" stroke-width="2"/>
    <path d="M70 92 h60 l-5 62 q-1 6-8 6 h-34 q-7 0-8-6z" fill="${tone}"/>
    <path d="M68 70 h64 l-2 22 h-60z" fill="${top}"/>
    ${[[84, 82], [108, 76], [96, 100]].map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="16" rx="4" fill="#ffffff" opacity=".7" transform="rotate(15 ${x + 8} ${y + 8})"/>`).join('')}
    <rect x="112" y="24" width="6" height="70" rx="3" fill="#C7A66A" transform="rotate(12 115 60)"/>`,
  juice: () => ART.iced('#f08a24', '#ffc15e') + '<circle cx="138" cy="60" r="16" fill="#f7b733"/><circle cx="138" cy="60" r="11" fill="#ffd36e"/>',
  matcha: () => ART.iced('#6a9a3a', '#e9f0d8'),
  tea: () => ART.coffee('#b5651d'),
  soup: () => plate(true) + `<circle cx="100" cy="104" r="50" fill="#e07a2e"/><circle cx="100" cy="104" r="50" fill="none" stroke="#f3a25a" stroke-width="4"/>
    <circle cx="86" cy="94" r="8" fill="#f5d6b8"/><circle cx="114" cy="112" r="7" fill="#f5d6b8"/><path d="M96 118 q8-6 16 0" stroke="#fff" stroke-width="3" fill="none"/>${greens(110, 86)}`,
  wings: () => plate(true) + `${[[78, 92], [112, 88], [94, 120], [124, 118]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="18" ry="12" fill="#b2461f" transform="rotate(${x % 40} ${x} ${y})"/><ellipse cx="${x - 4}" cy="${y - 3}" rx="8" ry="4" fill="#d7663a" opacity=".8"/>`).join('')}
    ${[0, 1, 2].map((i) => `<circle cx="${70 + i * 30}" cy="${140 - i * 4}" r="2" fill="#f3f0e6"/>`).join('')}`,
};

const BG = {
  food: ['#f7efe2', '#e7d8c2'],
  drink: ['#e8efe9', '#c9dbd1'],
  dessert: ['#f8ebe6', '#ead2c8'],
};

const cache = {};
export function dishArt(kind = 'pasta') {
  if (cache[kind]) return cache[kind];
  const fn = ART[kind] || ART.pasta;
  const drink = ['coffee', 'iced', 'juice', 'matcha', 'tea'].includes(kind);
  const dessert = ['cake', 'waffle'].includes(kind);
  const svg = wrap(drink ? BG.drink : dessert ? BG.dessert : BG.food, fn());
  cache[kind] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return cache[kind];
}

export const ART_KINDS = Object.keys(ART);

/** Resolve a menu image field: real URL/data URL, or "art:<kind>" illustration. */
export function menuImage(img) {
  if (!img) return dishArt('pasta');
  if (String(img).startsWith('art:')) return dishArt(String(img).slice(4));
  return img;
}
