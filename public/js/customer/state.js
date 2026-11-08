// Customer app state (single store) + cart persistence.
import { tierFor } from '../core/pricing.js';

export const S = {
  api: null,
  settings: {},
  menu: [],
  categories: [],
  rewards: [],
  user: null,          // auth user {uid, isAnonymous, profile}
  table: null,         // verified table session {tableId, token, name, number, verifiedAt}
  cart: [],            // [{key, menuId, qty, variantId, addonIds, note}]
  orders: [],          // my orders (live)
  notifications: [],
  vouchers: [],
  ledger: [],
  orderType: 'dine_in',
  ready: false,
};

const CART_KEY = 'eh_cart';
const TABLE_KEY = 'eh_table';
export const TABLE_TTL = 8 * 3600e3;

export const bus = new EventTarget();
export const emit = (what = 'change') => bus.dispatchEvent(new CustomEvent(what));

export function loadLocal() {
  try { S.cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { S.cart = []; }
  try {
    const t = JSON.parse(localStorage.getItem(TABLE_KEY) || 'null');
    S.table = t && Date.now() - t.verifiedAt < TABLE_TTL ? t : null;
  } catch { S.table = null; }
  S.orderType = S.table ? 'dine_in' : 'takeaway';
}
export function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); emit('cart'); }
export function setTable(t) {
  S.table = t;
  if (t) localStorage.setItem(TABLE_KEY, JSON.stringify(t)); else localStorage.removeItem(TABLE_KEY);
  S.orderType = t ? 'dine_in' : 'takeaway';
  emit();
}

export const menuById = (id) => S.menu.find((m) => m.id === id);
export const catById = (id) => S.categories.find((c) => c.id === id);
export const cartCount = () => S.cart.reduce((s, l) => s + l.qty, 0);
export const qtyInCart = (menuId) => S.cart.filter((l) => l.menuId === menuId).reduce((s, l) => s + l.qty, 0);

export function addToCart({ menuId, qty = 1, variantId = null, addonIds = [], note = '' }) {
  const key = [menuId, variantId || '', [...addonIds].sort().join('+'), note.trim()].join('|');
  const ex = S.cart.find((l) => l.key === key);
  if (ex) ex.qty = Math.min(50, ex.qty + qty);
  else S.cart.push({ key, menuId, qty, variantId, addonIds, note: note.trim() });
  saveCart();
}
export function setLineQty(key, qty) {
  const l = S.cart.find((x) => x.key === key);
  if (!l) return;
  if (qty <= 0) S.cart = S.cart.filter((x) => x.key !== key); else l.qty = Math.min(50, qty);
  saveCart();
}
export function clearCart() { S.cart = []; saveCart(); }

export const isMember = () => !!(S.user && S.user.profile);
export const profile = () => (S.user && S.user.profile) || null;

/** Tier state computed from the user's ledger (display only – server is authoritative). */
export function tierInfo() {
  const s = S.settings;
  const windowDays = Number(s.tierWindowDays || 90);
  const since = Date.now() - windowDays * 864e5;
  const pos = S.ledger.filter((t) => t.createdAt >= since && t.delta > 0 && ['earn', 'bonus', 'referral', 'checkin'].includes(t.type));
  const windowPoints = pos.reduce((a, t) => a + t.delta, 0);
  const visits = S.ledger.filter((t) => t.createdAt >= since && t.type === 'earn').length;
  const { current, next } = tierFor(windowPoints, s.tiers || []);
  const pct = next ? Math.min(100, Math.round(((windowPoints - current.min) / (next.min - current.min)) * 100)) : 100;
  return { windowPoints, visits, current, next, pct, windowDays };
}

export function go(hash) { if (location.hash !== hash) location.hash = hash; else emit('route'); }
