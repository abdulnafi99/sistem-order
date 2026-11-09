// =====================================================================
// TAPJERR.io – Shared pricing engine
// ---------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for order price calculation.
// Used by:
//   • the browser (cart preview only – never trusted)
//   • server-logic.js (demo backend AND Firebase Cloud Functions)
// The server ALWAYS recomputes prices from the menu collection; any
// price sent by the client is ignored.
// All maths is done in integer cents to avoid floating point drift.
// =====================================================================

export const MAX_QTY_PER_LINE = 50;
export const MAX_LINES = 60;

const toCents = (rm) => Math.round(Number(rm || 0) * 100);
const toRM = (cents) => Math.round(cents) / 100;

/**
 * @param {object} p
 * @param {Array<{menuId:string, qty:number, variantId?:string, addonIds?:string[], note?:string}>} p.items
 * @param {Record<string, object>} p.menuMap   menu docs keyed by id (server copy)
 * @param {object} p.settings                  settings/general doc
 * @param {'dine_in'|'takeaway'} p.type
 * @param {object|null} [p.voucher]            voucher doc (already ownership-checked)
 * @param {Record<string, object>} [p.categoryMap]
 */
export function priceOrder({ items, menuMap, settings, type, voucher = null, categoryMap = {} }) {
  const errors = [];
  const lines = [];
  if (!Array.isArray(items) || items.length === 0) errors.push('Cart is empty.');
  if (Array.isArray(items) && items.length > MAX_LINES) errors.push('Too many items in one order.');

  let subtotal = 0;
  (items || []).slice(0, MAX_LINES).forEach((raw, idx) => {
    const menu = menuMap[raw && raw.menuId];
    if (!menu || menu.deleted) { errors.push(`Item #${idx + 1} no longer exists.`); return; }
    if (menu.available === false) { errors.push(`${menu.name} is sold out.`); return; }
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      errors.push(`Invalid quantity for ${menu.name}.`); return;
    }
    if (typeof menu.stockLeft === 'number' && menu.stockLeft < qty) {
      errors.push(`Only ${Math.max(0, menu.stockLeft)} ${menu.name} left today.`); return;
    }
    let unit = toCents(menu.price);
    let variant = null;
    const variants = Array.isArray(menu.variants) ? menu.variants : [];
    if (variants.length) {
      variant = variants.find((v) => v.id === raw.variantId) || null;
      if (!variant) { errors.push(`Please choose an option for ${menu.name}.`); return; }
      unit += toCents(variant.price);
    }
    const addonDefs = Array.isArray(menu.addons) ? menu.addons : [];
    const addonIds = Array.isArray(raw.addonIds) ? [...new Set(raw.addonIds)] : [];
    const addons = [];
    for (const id of addonIds) {
      const a = addonDefs.find((x) => x.id === id);
      if (!a) { errors.push(`Invalid add-on for ${menu.name}.`); return; }
      addons.push({ id: a.id, name: a.name, price: toRM(toCents(a.price)) });
      unit += toCents(a.price);
    }
    const lineTotal = unit * qty;
    subtotal += lineTotal;
    const cat = categoryMap[menu.categoryId];
    lines.push({
      menuId: menu.id,
      name: menu.name,
      image: menu.image || null,
      qty,
      basePrice: toRM(toCents(menu.price)),
      variant: variant ? { id: variant.id, name: variant.name, price: toRM(toCents(variant.price)) } : null,
      addons,
      note: String(raw.note || '').slice(0, 200),
      unitPrice: toRM(unit),
      lineTotal: toRM(lineTotal),
      categoryId: menu.categoryId || null,
      categoryType: (cat && cat.type) || menu.categoryType || 'food',
    });
  });

  // ---- voucher ----
  let discount = 0;
  let voucherInfo = null;
  if (voucher) {
    const minSpend = toCents(voucher.minSpend || 0);
    if (voucher.status !== 'active') errors.push('Voucher is no longer active.');
    else if (voucher.expiresAt && voucher.expiresAt < Date.now()) errors.push('Voucher has expired.');
    else if (subtotal < minSpend) errors.push(`Voucher needs a minimum spend of RM ${toRM(minSpend).toFixed(2)}.`);
    else {
      if (voucher.type === 'percent') {
        discount = Math.round(subtotal * Math.min(100, Number(voucher.value || 0)) / 100);
        if (voucher.maxDiscount) discount = Math.min(discount, toCents(voucher.maxDiscount));
      } else if (voucher.type === 'item') {
        // free item: discount equals the cheapest matching line's unit price
        const match = lines.filter((l) => l.menuId === voucher.menuId).sort((a, b) => a.unitPrice - b.unitPrice)[0];
        if (!match) errors.push(`Add ${voucher.itemName || 'the free item'} to use this voucher.`);
        else discount = toCents(match.basePrice);
      } else {
        discount = toCents(voucher.value);
      }
      discount = Math.min(discount, subtotal);
      voucherInfo = { id: voucher.id, name: voucher.name, code: voucher.code || null };
    }
  }

  const s = settings || {};
  const afterDiscount = subtotal - discount;
  const serviceRate = type === 'dine_in' ? Number(s.serviceChargeRate || 0) : 0;
  const serviceCharge = Math.round(afterDiscount * serviceRate);
  const tax = s.taxEnabled ? Math.round((afterDiscount + serviceCharge) * Number(s.taxRate || 0)) : 0;
  const total = afterDiscount + serviceCharge + tax;

  return {
    ok: errors.length === 0,
    errors,
    lines,
    subtotal: toRM(subtotal),
    discount: toRM(discount),
    voucher: voucherInfo,
    serviceCharge: toRM(serviceCharge),
    serviceRate,
    tax: toRM(tax),
    taxRate: s.taxEnabled ? Number(s.taxRate || 0) : 0,
    total: toRM(total),
  };
}

/** Tier lookup from points earned in the rolling window. */
export function tierFor(points, tiers) {
  const sorted = [...(tiers || [])].sort((a, b) => a.min - b.min);
  let current = sorted[0] || { id: 'classic', name: 'Classic', min: 0, multiplier: 1 };
  for (const t of sorted) if (points >= t.min) current = t;
  const next = sorted.find((t) => t.min > points) || null;
  return { current, next };
}

/** Points earned for a paid order total. */
export function pointsForTotal(total, settings, tier) {
  const rate = Number((settings && settings.pointsPerRM) || 0);
  const mult = Number((tier && tier.multiplier) || 1);
  return Math.floor(Number(total || 0) * rate * mult);
}
