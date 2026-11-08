// Menu catalogue, item sheet, cart & checkout.
import { menuImage } from '../core/art.js';
import { priceOrder } from '../core/pricing.js';
import { $, $$, esc, rm, icon, toast, openModal, errMsg, todayISO, formData, METHOD_LABEL } from '../core/ui.js';
import { S, bus, emit, go, menuById, catById, cartCount, qtyInCart, addToCart, setLineQty, clearCart, saveCart, isMember, profile } from './state.js';
import { openAuth } from './app.js';

let search = '';
let checkoutDraft = null;

// ------------------------------------------------------------------ catalogue
export function renderMenu(catArg) {
  const cats = S.categories;
  const activeCat = catArg && cats.find((c) => c.id === catArg) ? catArg : 'all';
  return `<div class="menu-top">
      <div class="search">${icon('search', 20)}<input class="input" id="menu-search" type="search" placeholder="Search coffee, pastries, beans…" value="${esc(search)}" autocomplete="off"></div>
      <div class="cat-chips" id="cat-chips">
        <button class="cat-chip ${activeCat === 'all' ? 'active' : ''}" data-cat="all"><span class="em">✨</span>All Menu</button>
        ${cats.map((c) => `<button class="cat-chip ${activeCat === c.id ? 'active' : ''}" data-cat="${esc(c.id)}"><span class="em">${esc(c.icon || '🍽️')}</span>${esc(c.name)}</button>`).join('')}
      </div>
    </div>
    ${S.table || S.orderType === 'takeaway' ? `<div class="page-pad" style="padding-top:12px"><div class="row small" style="background:#fff;border-radius:14px;padding:10px 14px;box-shadow:var(--shadow-sm)">${icon(S.orderType === 'dine_in' && S.table ? 'utensils' : 'bag', 18)}<span class="grow">${S.orderType === 'dine_in' && S.table ? `Ordering to <b>${esc(S.table.name)}</b>` : '<b>Takeaway</b> · self pick-up'}</span>${S.table ? `<button class="btn btn-xs btn-light" id="switch-type">${S.orderType === 'dine_in' ? 'Takeaway instead' : 'Dine in'}</button>` : ''}</div></div>` : ''}
    <div id="menu-results">${menuResults(activeCat)}</div>`;
}

function menuResults(activeCat) {
  const q = search.trim().toLowerCase();
  const cats = S.categories.filter((c) => activeCat === 'all' || c.id === activeCat);
  const match = (m) => !q || `${m.name} ${m.description || ''} ${(m.tags || []).join(' ')}`.toLowerCase().includes(q);
  const favs = (profile() && profile().favorites) || [];
  const sections = cats.map((c) => {
    const items = S.menu.filter((m) => m.categoryId === c.id && match(m)).sort((a, b) => (b.available !== false) - (a.available !== false) || (a.sort || 0) - (b.sort || 0));
    if (!items.length) return '';
    const avail = items.filter((m) => m.available !== false).length;
    return `<section class="menu-section" id="sec-${esc(c.id)}"><h2>${esc(c.name)} <small>${avail} available</small></h2>
      <div class="menu-grid">${items.map((m) => dishCard(m, favs.includes(m.id))).join('')}</div></section>`;
  }).join('');
  return sections || `<div class="empty"><div class="empty-ic">${icon('search', 28)}</div><h4>No dishes found</h4><p>Try a different search or category.</p></div>`;
}

function dishCard(m, fav) {
  const sold = m.available === false;
  const inCart = qtyInCart(m.id);
  return `<div class="dish ${sold ? 'soldout' : ''}" data-open="${esc(m.id)}">
    <div class="dish-img"><img src="${esc(menuImage(m.image))}" alt="${esc(m.name)}" loading="lazy">
      <button class="fav ${fav ? 'on' : ''}" data-fav="${esc(m.id)}" aria-label="Favourite">${icon('heart', 18)}</button>
      ${inCart ? `<span class="qty-badge">${inCart}</span>` : ''}
      <button class="add" data-add="${esc(m.id)}" aria-label="Add ${esc(m.name)}">${icon('plus', 22)}</button>
    </div>
    <h4>${esc(m.name)}</h4>
    <div class="price">${rm(m.price)}</div>
    ${!sold && typeof m.stockLeft === 'number' && m.stockLeft <= 10 ? `<span class="stock">🔥 ${m.stockLeft} left today</span>` : ''}
    ${m.tags && m.tags.length && !(typeof m.stockLeft === 'number' && m.stockLeft <= 10) ? `<div class="mt-s"><span class="chip gold">${esc(m.tags[0])}</span></div>` : ''}
  </div>`;
}

bus.addEventListener('rendered', (e) => {
  const { page } = e.detail;
  if (page === 'menu') bindMenu();
  if (page === 'checkout') bindCheckout();
});

function bindMenu() {
  const input = $('#menu-search');
  if (input) input.addEventListener('input', () => {
    search = input.value;
    const active = $('.cat-chip.active');
    $('#menu-results').innerHTML = menuResults(active ? active.dataset.cat : 'all');
  });
  const sw = $('#switch-type');
  if (sw) sw.addEventListener('click', () => { S.orderType = S.orderType === 'dine_in' ? 'takeaway' : 'dine_in'; emit(); });
  $$('.cat-chip').forEach((b) => b.addEventListener('click', () => {
    const cat = b.dataset.cat;
    location.hash = cat === 'all' ? '#/menu' : `#/menu/${cat}`;
  }));
  const active = $('.cat-chip.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#menu-results').addEventListener('click', async (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      e.stopPropagation();
      const m = menuById(add.dataset.add);
      if (m && !(m.variants || []).length && !(m.addons || []).length) { addToCart({ menuId: m.id }); toast(`${m.name} added`, 'success', 1600); emit(); }
      else openItem(add.dataset.add);
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) openItem(open.dataset.open);
  });
}

async function toggleFav(id) {
  if (!isMember()) { openAuth('register'); return; }
  const p = profile();
  const favs = new Set(p.favorites || []);
  favs.has(id) ? favs.delete(id) : favs.add(id);
  try { await S.api.save('users', p.id, { favorites: [...favs] }); } catch (e) { toast(errMsg(e), 'error'); }
}

// ------------------------------------------------------------------ item sheet
export function openItem(id) {
  const m = menuById(id);
  if (!m) return;
  const sold = m.available === false;
  const variants = m.variants || [];
  const addons = m.addons || [];
  let qty = 1;
  const calc = (el) => {
    const v = variants.find((x) => x.id === (($('input[name=variant]:checked', el) || {}).value));
    const ad = $$('input[name=addon]:checked', el).map((i) => addons.find((a) => a.id === i.value)).filter(Boolean);
    const unit = Number(m.price) + (v ? Number(v.price) : 0) + ad.reduce((s, a) => s + Number(a.price), 0);
    return unit * qty;
  };
  openModal({
    sheet: true,
    body: `<div class="item-hero"><img src="${esc(menuImage(m.image))}" alt=""></div>
      <div class="row between mt"><h2 style="font-size:24px">${esc(m.name)}</h2><b style="font-size:18px;color:var(--emerald)">${rm(m.price)}</b></div>
      <p class="muted mt-s">${esc(m.description || '')}</p>
      <div class="row wrap mt-s">${sold ? '<span class="chip red">Sold out</span>' : '<span class="chip green">Available</span>'}${typeof m.stockLeft === 'number' && !sold ? `<span class="chip orange">🔥 ${m.stockLeft} left today</span>` : ''}${(m.tags || []).map((t) => `<span class="chip gold">${esc(t)}</span>`).join('')}</div>
      <form id="item-form">
      ${variants.length ? `<div class="opt-group"><h5>Choose option <span class="chip red" style="font-size:10px">Required</span></h5>${variants.map((v, i) => `<label class="opt"><input type="radio" name="variant" value="${esc(v.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(v.name)}</span><em>${Number(v.price) ? `+${rm(v.price)}` : ''}</em></label>`).join('')}</div>` : ''}
      ${addons.length ? `<div class="opt-group"><h5>Add-ons <span class="muted xs">Optional</span></h5>${addons.map((a) => `<label class="opt"><input type="checkbox" name="addon" value="${esc(a.id)}"><span>${esc(a.name)}</span><em>+${rm(a.price)}</em></label>`).join('')}</div>` : ''}
      <div class="opt-group"><h5>Special request</h5><textarea class="input" name="note" maxlength="200" placeholder="e.g. less spicy, no onion"></textarea></div>
      <div class="row between mt" style="position:sticky;bottom:-20px;background:#fff;padding:14px 0 6px;">
        <div class="qty"><button type="button" data-q="-1" aria-label="Decrease">${icon('minus', 18)}</button><b id="q">1</b><button type="button" data-q="1" aria-label="Increase">${icon('plus', 18)}</button></div>
        <button class="btn btn-primary btn-lg grow" type="submit" ${sold ? 'disabled' : ''}>${sold ? 'Sold out' : `Add to Cart · <span id="item-total">${rm(m.price)}</span>`}</button>
      </div></form>`,
    onOpen: (el, close) => {
      const upd = () => { $('#q', el).textContent = qty; const t = $('#item-total', el); if (t) t.textContent = rm(calc(el)); };
      upd();
      el.addEventListener('change', upd);
      $$('[data-q]', el).forEach((b) => b.addEventListener('click', () => { qty = Math.max(1, Math.min(typeof m.stockLeft === 'number' ? Math.max(1, m.stockLeft) : 50, qty + Number(b.dataset.q))); upd(); }));
      $('#item-form', el).addEventListener('submit', (e) => {
        e.preventDefault();
        if (sold) return;
        const v = $('input[name=variant]:checked', el);
        addToCart({ menuId: m.id, qty, variantId: v ? v.value : null, addonIds: $$('input[name=addon]:checked', el).map((i) => i.value), note: $('[name=note]', el).value });
        toast(`${qty} × ${m.name} added to cart`, 'success', 1800);
        close(); emit();
      });
    },
  });
}

// ------------------------------------------------------------------ cart
function linesPreview(type = S.orderType, voucher = null) {
  const menuMap = Object.fromEntries(S.menu.map((m) => [m.id, m]));
  const categoryMap = Object.fromEntries(S.categories.map((c) => [c.id, c]));
  return priceOrder({ items: S.cart, menuMap, settings: S.settings, type, voucher, categoryMap });
}

export function cartBar() {
  const n = cartCount();
  if (!n) return '';
  const p = linesPreview();
  return `<span class="cnt">${n}</span><span class="grow"><b>${rm(p.subtotal)}</b><div class="xs" style="opacity:.8">${S.orderType === 'dine_in' && S.table ? esc(S.table.name) : 'Takeaway'} · excl. charges</div></span><span class="go">View Cart ${icon('chevron', 16)}</span>`;
}

function cartLineHtml(l) {
  const m = menuById(l.menuId);
  if (!m) return '';
  const v = (m.variants || []).find((x) => x.id === l.variantId);
  const ad = (m.addons || []).filter((a) => (l.addonIds || []).includes(a.id));
  const unit = Number(m.price) + (v ? Number(v.price) : 0) + ad.reduce((s, a) => s + Number(a.price), 0);
  return `<div class="cart-line" data-key="${esc(l.key)}">
    <img src="${esc(menuImage(m.image))}" alt="">
    <div class="grow"><h4>${esc(m.name)}</h4>
      <div class="meta">${v ? esc(v.name) : ''}${ad.length ? `${v ? ' · ' : ''}+ ${ad.map((a) => esc(a.name)).join(', ')}` : ''}</div>
      ${l.note ? `<div class="meta">“${esc(l.note)}”</div>` : ''}
      ${m.available === false ? '<span class="chip red">Sold out – please remove</span>' : ''}
      <div class="row between mt-s"><b>${rm(unit * l.qty)}</b>
      <div class="qty sm"><button data-lq="-1" aria-label="Decrease">${icon(l.qty === 1 ? 'trash' : 'minus', 15)}</button><b>${l.qty}</b><button data-lq="1" aria-label="Increase">${icon('plus', 15)}</button></div></div>
    </div></div>`;
}

export function openCart() {
  const body = () => {
    if (!S.cart.length) return `<div class="empty"><div class="empty-ic">${icon('cart', 28)}</div><h4>Your cart is empty</h4><p>Add something delicious from the menu.</p></div>`;
    const p = linesPreview();
    return `<div class="row small" style="background:var(--cream);border-radius:14px;padding:10px 12px">${icon(S.orderType === 'dine_in' && S.table ? 'utensils' : 'bag', 18)}<span class="grow">${S.orderType === 'dine_in' && S.table ? `Dine in · <b>${esc(S.table.name)}</b>` : '<b>Takeaway</b> · self pick-up'}</span></div>
      ${S.cart.map(cartLineHtml).join('')}
      <div class="mt"><div class="sum-row"><span>Subtotal</span><b>${rm(p.subtotal)}</b></div>
      ${p.serviceCharge ? `<div class="sum-row muted"><span>Service charge (${Math.round(p.serviceRate * 100)}%)</span><span>${rm(p.serviceCharge)}</span></div>` : ''}
      ${p.tax ? `<div class="sum-row muted"><span>SST (${Math.round(p.taxRate * 100)}%)</span><span>${rm(p.tax)}</span></div>` : ''}
      <div class="sum-row total"><span>Estimated total</span><span>${rm(p.total)}</span></div></div>`;
  };
  const m = openModal({
    title: 'Your Cart', sheet: true, body: body(),
    actions: S.cart.length ? [
      { label: `${icon('trash', 16)} Clear`, cls: 'btn-ghost', onClick: (el) => { clearCart(); $('.modal-body', el).innerHTML = body(); } },
      { label: `Checkout ${icon('chevron', 16)}`, cls: 'btn-primary', onClick: (el, close) => { close(); go('#/checkout'); } },
    ] : [{ label: 'Browse menu', cls: 'btn-primary', onClick: (el, close) => { close(); go('#/menu'); } }],
    onOpen: (el) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lq]');
        if (!b) return;
        const key = b.closest('[data-key]').dataset.key;
        const line = S.cart.find((l) => l.key === key);
        setLineQty(key, line.qty + Number(b.dataset.lq));
        $('.modal-body', el).innerHTML = body();
        if (!S.cart.length) $('.modal-foot', el) && $('.modal-foot', el).remove();
        emit();
      });
    },
  });
  return m;
}

// ------------------------------------------------------------------ checkout
function nextPickupSlot() {
  const lead = Number(S.settings.pickupLeadMinutes || 15);
  const d = new Date(Date.now() + (lead + 5) * 60e3);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

export function renderCheckout() {
  if (!S.cart.length) {
    return `<div class="page-head"><button class="icon-btn solid" onclick="history.back()" aria-label="Back">${icon('back')}</button><h1>Checkout</h1></div>
      <div class="empty"><div class="empty-ic">${icon('cart', 28)}</div><h4>Your cart is empty</h4><a class="btn btn-primary mt" href="#/menu">Browse menu</a></div>`;
  }
  const p0 = profile();
  if (!checkoutDraft) {
    const slot = nextPickupSlot();
    checkoutDraft = { name: p0 ? p0.name : '', phone: p0 ? p0.phone : '', date: slot.date, time: slot.time, note: '', voucherId: '', paymentMethod: 'cash' };
  }
  const d = checkoutDraft;
  if (!S.table && S.orderType === 'dine_in') S.orderType = 'takeaway';
  const type = S.orderType;
  const vouchers = S.vouchers.filter((v) => v.status === 'active' && (!v.expiresAt || v.expiresAt > Date.now()));
  const voucher = vouchers.find((v) => v.id === d.voucherId) || null;
  const p = linesPreview(type, voucher);
  const methods = S.settings.paymentMethods || { cash: true };
  if (!methods[d.paymentMethod]) d.paymentMethod = Object.keys(methods).find((k) => methods[k]) || 'cash';
  const closed = S.settings.acceptingOrders === false;

  return `<div class="page-head"><button class="icon-btn solid" onclick="history.back()" aria-label="Back">${icon('back')}</button><h1>Checkout</h1></div>
  <form class="page-pad stack" id="checkout-form" novalidate>
    <div class="segmented" role="tablist">
      <button type="button" data-type="dine_in" class="${type === 'dine_in' ? 'active' : ''}" ${S.table ? '' : 'disabled title="Scan your table QR to dine in"'}>${icon('utensils', 16)} Dine In</button>
      <button type="button" data-type="takeaway" class="${type === 'takeaway' ? 'active' : ''}">${icon('bag', 16)} Takeaway</button>
    </div>

    ${type === 'dine_in' ? `<div class="table-card" style="margin:0"><div class="tc-ic">${icon('utensils', 24)}</div><div class="grow"><div class="eyebrow">Table (verified by QR)</div><h3>${esc(S.table.name)}</h3></div><span class="chip green">${icon('check', 12)} Locked</span></div>`
      : `<div class="card card-pad stack"><h3 style="font-size:18px">Pickup details</h3>
        <div class="form-grid">
          <label class="field full"><span>Name</span><input class="input" name="name" value="${esc(d.name)}" autocomplete="name" required></label>
          <label class="field full"><span>Phone number</span><input class="input" name="phone" type="tel" value="${esc(d.phone)}" autocomplete="tel" placeholder="+60 12-345 6789" required></label>
          <label class="field"><span>Pickup date</span><input class="input" name="date" type="date" value="${esc(d.date)}" min="${todayISO()}" max="${todayISO(7)}" required></label>
          <label class="field"><span>Pickup time</span><input class="input" name="time" type="time" value="${esc(d.time)}" required></label>
        </div>
        <p class="xs muted">${icon('clock', 13)} Ready in about ${S.settings.pickupLeadMinutes || 15} minutes after ordering.</p></div>`}
    ${!S.table ? `<p class="xs muted center">${icon('qr', 13)} Dine in? Scan the QR code on your table to order to your table.</p>` : ''}

    <div class="card card-pad"><div class="row between"><h3 style="font-size:18px">Order summary</h3><button type="button" class="btn btn-xs btn-light" id="edit-cart">Edit</button></div>
      ${p.lines.map((l) => `<div class="sum-row"><span>${l.qty} × ${esc(l.name)}${l.variant ? ` <span class="muted xs">(${esc(l.variant.name)})</span>` : ''}${l.addons.length ? `<br><span class="muted xs">+ ${l.addons.map((a) => esc(a.name)).join(', ')}</span>` : ''}${l.note ? `<br><span class="muted xs">“${esc(l.note)}”</span>` : ''}</span><span>${rm(l.lineTotal)}</span></div>`).join('')}
      ${p.errors.length ? `<div class="chip red mt-s" style="white-space:normal">${esc(p.errors[0])}</div>` : ''}
    </div>

    <label class="field"><span>Special request for the kitchen</span><textarea class="input" name="note" maxlength="300" placeholder="Allergies, cutlery, celebrations…">${esc(d.note)}</textarea></label>

    ${isMember() ? `<label class="field"><span>Voucher</span><select class="input" name="voucherId"><option value="">No voucher</option>${vouchers.map((v) => `<option value="${esc(v.id)}" ${v.id === d.voucherId ? 'selected' : ''}>${esc(v.name)}${v.minSpend ? ` (min RM${v.minSpend})` : ''}</option>`).join('')}</select>${!vouchers.length ? '<span class="hint">Redeem vouchers in Rewards.</span>' : ''}</label>`
      : `<div class="card card-pad row" style="background:var(--gold-soft)">${icon('award', 22)}<div class="grow small"><b>Earn ${Math.floor(p.total * (S.settings.pointsPerRM || 0))} points</b> on this order.<br>Join free before you order.</div><button type="button" class="btn btn-sm btn-dark" data-action="register">Join</button></div>`}

    <div><h3 style="font-size:18px;margin-bottom:10px">Payment method</h3>
      ${methods.cash ? payOpt('cash', 'wallet', type === 'dine_in' ? 'Pay at counter' : 'Pay at pickup', 'Cash or card at the cashier', d.paymentMethod) : ''}
      ${methods.duitnow ? payOpt('duitnow', 'qr', 'DuitNow QR', 'Scan & transfer – verified by our cashier', d.paymentMethod) : ''}
      ${methods.online ? payOpt('online', 'card', 'Online Payment', 'FPX / cards via secure gateway', d.paymentMethod) : ''}
    </div>

    <div class="card card-pad">
      <div class="sum-row"><span>Subtotal</span><b>${rm(p.subtotal)}</b></div>
      ${p.discount ? `<div class="sum-row emerald"><span>Voucher discount</span><span>-${rm(p.discount)}</span></div>` : ''}
      ${p.serviceCharge ? `<div class="sum-row muted"><span>Service charge (${Math.round(p.serviceRate * 100)}%)</span><span>${rm(p.serviceCharge)}</span></div>` : ''}
      ${p.tax ? `<div class="sum-row muted"><span>SST (${Math.round(p.taxRate * 100)}%)</span><span>${rm(p.tax)}</span></div>` : ''}
      <div class="sum-row total"><span>Grand total</span><span>${rm(p.total)}</span></div>
      <p class="xs muted mt-s">${icon('shield', 12)} Final amount is verified by our system when you confirm.</p>
    </div>
    ${closed ? '<div class="chip red" style="justify-content:center;padding:10px">We are not accepting orders right now</div>' : ''}
    <button class="btn btn-primary btn-lg btn-block" type="submit" id="confirm-btn" ${p.ok && !closed ? '' : 'disabled'}>${icon('check', 18)} Confirm Order · ${rm(p.total)}</button>
    <div style="height:20px"></div>
  </form>`;
}

function payOpt(value, ic, title, sub, cur) {
  return `<label class="pay-opt"><input type="radio" name="paymentMethod" value="${value}" ${cur === value ? 'checked' : ''}><span class="po-ic">${icon(ic, 20)}</span><span class="grow"><b>${title}</b><div class="xs muted">${sub}</div></span></label>`;
}

function bindCheckout() {
  const form = $('#checkout-form');
  if (!form) return;
  const sync = () => { Object.assign(checkoutDraft, formData(form)); };
  form.addEventListener('input', sync);
  form.addEventListener('change', (e) => { sync(); if (['voucherId', 'paymentMethod'].includes(e.target.name)) emit(); });
  $$('[data-type]', form).forEach((b) => b.addEventListener('click', () => { sync(); S.orderType = b.dataset.type; emit(); }));
  const ec = $('#edit-cart'); if (ec) ec.addEventListener('click', openCart);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sync();
    const btn = $('#confirm-btn');
    const d = checkoutDraft;
    const type = S.orderType;
    if (type === 'dine_in' && !S.table) return toast('Please scan your table QR code', 'error');
    btn.disabled = true; btn.classList.add('loading');
    try {
      await S.api.auth.ensureGuest();
      const res = await S.api.call('placeOrder', {
        type,
        tableId: type === 'dine_in' ? S.table.tableId : null,
        token: type === 'dine_in' ? S.table.token : null,
        items: S.cart.map(({ menuId, qty, variantId, addonIds, note }) => ({ menuId, qty, variantId, addonIds, note })),
        note: d.note,
        customerName: type === 'takeaway' ? d.name : undefined,
        customerPhone: type === 'takeaway' ? d.phone : undefined,
        pickupDate: d.date, pickupTime: d.time,
        paymentMethod: d.paymentMethod,
        voucherId: d.voucherId || null,
      });
      clearCart();
      checkoutDraft = null;
      sessionStorage.setItem('eh_just_ordered', res.orderId);
      go(`#/order/${res.orderId}`);
    } catch (err) {
      toast(errMsg(err), 'error', 5000);
      if (err.code === 'permission-denied' && type === 'dine_in') {
        openModal({ title: 'Table QR expired', body: `<p class="muted">${esc(errMsg(err))}</p>`, actions: [{ label: 'OK', cls: 'btn-primary' }] });
      }
    } finally { btn.disabled = false; btn.classList.remove('loading'); }
  });
}

export { METHOD_LABEL, saveCart };
