// Sample data for the initial demo. Used by the demo backend on first run and
// by `scripts/seed-firestore.mjs` to bootstrap a fresh Firebase project.

export const DEFAULT_SETTINGS = {
  id: 'general',
  restaurantName: 'SELAGI COFFEE',
  tagline: 'Premium artisan coffee, slowly crafted',
  heroTitle: 'Slow Brewed Moments',
  logo: null,
  banner: null,
  address: 'No. 8, Jalan Selagi, 50450 Kuala Lumpur',
  phone: '+60 12-345 6789',
  email: 'hello@selagicoffee.my',
  openingHours: 'Daily · 8:00 AM – 11:00 PM',
  currency: 'RM',
  timezoneOffset: 8,
  orderPrefix: 'SC',
  memberPrefix: 'SC',
  acceptingOrders: true,
  serviceChargeRate: 0.1,
  taxEnabled: true,
  taxRate: 0.06,
  pickupLeadMinutes: 15,
  paymentMethods: { cash: true, duitnow: true, online: false },
  duitnowName: 'SELAGI COFFEE SDN BHD',
  duitnowId: '1234567890',
  duitnowQr: null,
  gateway: { provider: 'billplz', enabled: false },
  pointsPerRM: 10,
  tierWindowDays: 90,
  tiers: [
    { id: 'classic', name: 'Classic', min: 0, multiplier: 1, color: '#9aa6a1', perks: ['Earn 10 pts per RM1', 'Birthday treat'] },
    { id: 'silver', name: 'Silver', min: 2000, multiplier: 1.2, color: '#b8c2c8', perks: ['1.2× points', 'Free upsize monthly', 'Priority pickup'] },
    { id: 'gold', name: 'Gold', min: 5000, multiplier: 1.5, color: '#C7A66A', perks: ['1.5× points', 'Free dessert monthly', 'Members-only menu'] },
    { id: 'platinum', name: 'Platinum', min: 10000, multiplier: 2, color: '#e5e4e2', perks: ['2× points', 'Free drink weekly', 'Private event invites'] },
  ],
  referralBonus: 500,
  checkInPoints: 10,
  profileBonus: 75,
  promotions: [
    { id: 'p1', title: 'Single Origin of the Month', subtitle: 'Hand-brewed V60 · Ethiopia Yirgacheffe', badge: 'Brew Bar', color: '#344E41' },
    { id: 'p2', title: 'Coffee & Croissant', subtitle: 'Any latte + butter croissant · RM 18', badge: 'Morning', color: '#5b4632' },
    { id: 'p3', title: 'Double Points Weekend', subtitle: 'Earn 2× points every Sat & Sun', badge: 'Members', color: '#8a6d3b' },
  ],
};

export const CATEGORIES = [
  { id: 'espresso', name: 'Espresso Bar', icon: '☕', type: 'beverage', sort: 1 },
  { id: 'signature', name: 'Signature Lattes', icon: '✨', type: 'beverage', sort: 2 },
  { id: 'manual', name: 'Manual Brew', icon: '🫖', type: 'beverage', sort: 3 },
  { id: 'cold', name: 'Cold Brew & Iced', icon: '🧊', type: 'beverage', sort: 4 },
  { id: 'noncoffee', name: 'Non-Coffee', icon: '🍵', type: 'beverage', sort: 5 },
  { id: 'pastry', name: 'Pastries & Cakes', icon: '🥐', type: 'food', sort: 6 },
  { id: 'bites', name: 'Brunch & Bites', icon: '🥪', type: 'food', sort: 7 },
  { id: 'beans', name: 'Coffee Beans', icon: '🫘', type: 'retail', sort: 8 },
].map((c) => ({ ...c, active: true }));

const sizes = [{ id: 'reg', name: 'Regular (8oz)', price: 0 }, { id: 'lg', name: 'Large (12oz)', price: 2 }];
const temp = [{ id: 'hot', name: 'Hot', price: 0 }, { id: 'iced', name: 'Iced', price: 1 }];
const milk = [{ id: 'oat', name: 'Oat milk', price: 2 }, { id: 'shot', name: 'Extra shot', price: 2.5 }, { id: 'syrup', name: 'Vanilla syrup', price: 1.5 }];
const brew = [{ id: 'v60', name: 'Hario V60', price: 0 }, { id: 'aeropress', name: 'AeroPress', price: 0 }, { id: 'chemex', name: 'Chemex (2 cups)', price: 8 }];
const grind = [{ id: 'whole', name: 'Whole bean', price: 0 }, { id: 'filter', name: 'Ground – filter', price: 0 }, { id: 'espresso', name: 'Ground – espresso', price: 0 }];
const bakery = [{ id: 'warm', name: 'Warmed up', price: 0 }, { id: 'butter', name: 'Salted butter & jam', price: 2 }];

const M = (id, name, categoryId, price, image, description, extra = {}) => ({
  id, name, categoryId, price, image, description, available: true, featured: false, soldCount: 0,
  variants: [], addons: [], tags: [], ...extra,
});

export const MENU = [
  // Espresso bar
  M('espresso', 'Espresso', 'espresso', 7, 'art:espresso', 'Double ristretto of our Selagi House Blend – cocoa, caramel and a hint of red fruit.', { addons: [{ id: 'shot', name: 'Extra shot', price: 2.5 }], soldCount: 18 }),
  M('americano', 'Americano', 'espresso', 9, 'art:coffee', 'Double espresso lengthened with hot water. Clean, bold and bright.', { variants: temp, addons: milk, soldCount: 33 }),
  M('latte', 'Café Latte', 'espresso', 11, 'art:latte', 'Double shot espresso with silky steamed milk.', { variants: temp, addons: milk, tags: ['Bestseller'], soldCount: 60 }),
  M('cappuccino', 'Cappuccino', 'espresso', 11, 'art:cappuccino', 'Equal parts espresso, steamed milk and velvety foam, dusted with cocoa.', { addons: milk, soldCount: 27 }),
  M('flat-white', 'Flat White', 'espresso', 12, 'art:latte', 'Ristretto shots under a thin layer of micro-foam – stronger and smoother.', { addons: milk, featured: true, soldCount: 31 }),
  M('mocha', 'Mocha', 'espresso', 13, 'art:mocha', 'Espresso, Belgian dark chocolate and steamed milk.', { variants: temp, addons: milk, soldCount: 15 }),
  // Signature lattes
  M('spanish-latte', 'Spanish Latte', 'signature', 13, 'art:icedlatte', 'Condensed-milk sweetened latte, served iced.', { variants: sizes, addons: milk, featured: true, tags: ['Signature'], soldCount: 47 }),
  M('gula-melaka-latte', 'Gula Melaka Latte', 'signature', 14, 'art:icedlatte', 'House palm-sugar syrup, espresso and fresh milk – our local favourite.', { variants: temp, addons: milk, featured: true, tags: ['Signature'], soldCount: 52 }),
  M('pandan-latte', 'Pandan Coconut Latte', 'signature', 14, 'art:latte', 'Fresh pandan, coconut milk and espresso. Fragrant and creamy.', { variants: temp, addons: milk, soldCount: 22 }),
  M('sea-salt-caramel', 'Sea Salt Caramel Latte', 'signature', 15, 'art:icedlatte', 'Burnt caramel, a pinch of sea salt and a salted cream top.', { variants: temp, addons: milk, soldCount: 19 }),
  M('selagi-cream', 'Selagi Cream Coffee', 'signature', 15, 'art:coldbrew', 'Our signature: cold brew topped with whipped vanilla-gula cream.', { variants: sizes, featured: true, tags: ['House special'], soldCount: 24 }),
  // Manual brew
  M('single-origin', 'Single Origin Pour Over', 'manual', 18, 'art:pourover', 'Ethiopia Yirgacheffe, washed – jasmine, bergamot and stone fruit. Brewed to order.', { variants: brew, stockLeft: 6, featured: true, tags: ['Brew Bar'], soldCount: 12 }),
  M('house-pour-over', 'House Blend Pour Over', 'manual', 14, 'art:pourover', 'Brazil & Sumatra blend – chocolatey, round and comforting.', { variants: brew, soldCount: 9 }),
  // Cold
  M('cold-brew', 'Cold Brew', 'cold', 12, 'art:coldbrew', '18-hour steeped cold brew. Smooth, low acidity, naturally sweet.', { variants: sizes, soldCount: 28 }),
  M('iced-shaken-espresso', 'Iced Shaken Espresso', 'cold', 13, 'art:icedlatte', 'Espresso shaken with brown sugar and ice, finished with oat milk.', { soldCount: 16 }),
  M('espresso-tonic', 'Espresso Tonic', 'cold', 14, 'art:juice', 'Espresso over tonic water and orange peel. Bright and sparkling.', { soldCount: 11 }),
  // Non-coffee
  M('iced-matcha', 'Iced Matcha Latte', 'noncoffee', 15, 'art:matcha', 'Ceremonial-grade matcha with fresh milk over ice.', { variants: sizes, addons: [{ id: 'oat', name: 'Oat milk', price: 2 }], featured: true, soldCount: 29 }),
  M('hot-chocolate', 'Dark Hot Chocolate', 'noncoffee', 12, 'art:mocha', '70% dark chocolate melted into steamed milk.', { variants: temp, soldCount: 13 }),
  M('chai-latte', 'Masala Chai Latte', 'noncoffee', 12, 'art:tea', 'Spiced black tea brewed with milk – cinnamon, cardamom and ginger.', { variants: temp, soldCount: 10 }),
  // Pastries & cakes
  M('butter-croissant', 'Butter Croissant', 'pastry', 9, 'art:croissant', 'Flaky French butter croissant, baked every morning.', { addons: bakery, soldCount: 40 }),
  M('almond-croissant', 'Almond Croissant', 'pastry', 12, 'art:croissant', 'Twice-baked with frangipane and toasted almonds.', { featured: true, soldCount: 21 }),
  M('choc-cake', 'Dark Chocolate Cake', 'pastry', 14, 'art:cake', 'Rich layered dark chocolate cake with espresso ganache.', { soldCount: 16 }),
  M('burnt-cheesecake', 'Basque Burnt Cheesecake', 'pastry', 15, 'art:cake', 'Caramelised top, molten creamy centre.', { featured: true, tags: ['Chef pick'], soldCount: 25 }),
  M('cookie', 'Sea Salt Choc Chip Cookie', 'pastry', 7, 'art:cookie', 'Brown butter dough, dark chocolate chunks and flaky sea salt.', { soldCount: 34 }),
  // Brunch & bites
  M('avocado-toast', 'Avocado Sourdough Toast', 'bites', 18, 'art:toast', 'Smashed avocado, soft egg, chilli flakes and lime on sourdough.', { addons: [{ id: 'egg', name: 'Extra egg', price: 2 }, { id: 'feta', name: 'Feta cheese', price: 3 }], soldCount: 26 }),
  M('big-breakfast', 'Selagi Big Breakfast', 'bites', 26, 'art:toast', 'Sourdough toast, sunny eggs, chicken sausage, hash brown and sautéed mushrooms.', { addons: [{ id: 'egg', name: 'Extra egg', price: 2 }, { id: 'avo', name: 'Avocado', price: 4 }], soldCount: 14 }),
  M('croffle', 'Brown Sugar Croffle', 'bites', 14, 'art:waffle', 'Croissant waffle with brown sugar glaze and vanilla ice cream.', { soldCount: 18 }),
  // Beans (retail)
  M('house-blend-beans', 'Selagi House Blend (250g)', 'beans', 48, 'art:beans', 'Medium roast · Brazil & Sumatra · chocolate, caramel, toasted nuts.', { variants: grind, soldCount: 6 }),
  M('ethiopia-beans', 'Ethiopia Yirgacheffe (200g)', 'beans', 62, 'art:beans', 'Light roast · jasmine, bergamot, peach. For filter brewing.', { variants: grind, stockLeft: 8, soldCount: 3 }),
];

export const TABLES = ['01', '02', '03', '04', '05', '06', 'Bar 1', 'Bar 2'].map((n, i) => ({
  id: `T${String(i + 1).padStart(2, '0')}`,
  number: n,
  name: n.startsWith('Bar') ? `Table ${n}` : `Table ${n}`,
  seats: n.startsWith('Bar') ? 2 : 4,
  zone: n.startsWith('Bar') ? 'Bar' : i < 4 ? 'Indoor' : 'Patio',
  status: 'available',
  active: true,
  sessionId: null,
}));

export const REWARDS = [
  { id: 'rw-rm5', name: 'RM5 Off', description: 'RM5 off any order above RM25.', cost: 500, type: 'amount', value: 5, minSpend: 25, icon: '🎟️', validDays: 30, active: true },
  { id: 'rw-coffee', name: 'Free Café Latte', description: 'One free Café Latte (regular).', cost: 900, type: 'item', value: 0, menuId: 'latte', itemName: 'Café Latte', minSpend: 0, icon: '☕', validDays: 30, active: true },
  { id: 'rw-10pct', name: '10% Off Bill', description: '10% off your total, max RM20.', cost: 1500, type: 'percent', value: 10, maxDiscount: 20, minSpend: 40, icon: '💚', validDays: 30, active: true },
  { id: 'rw-cake', name: 'Free Croissant', description: 'A butter croissant on us, fresh from the oven.', cost: 1200, type: 'item', value: 0, menuId: 'butter-croissant', itemName: 'Butter Croissant', minSpend: 0, icon: '🥐', validDays: 30, active: true },
  { id: 'rw-rm20', name: 'RM20 Off', description: 'RM20 off orders above RM80. Gold & above.', cost: 3000, type: 'amount', value: 20, minSpend: 80, minTier: 'gold', icon: '👑', validDays: 30, active: true },
];

export const DEMO_STAFF = [
  { email: 'admin@selagicoffee.my', password: 'admin123', name: 'Aisyah (Owner)', role: 'super_admin' },
  { email: 'manager@selagicoffee.my', password: 'manager123', name: 'Daniel Lim', role: 'manager' },
  { email: 'cashier@selagicoffee.my', password: 'cashier123', name: 'Mei Ling', role: 'cashier' },
  { email: 'kitchen@selagicoffee.my', password: 'kitchen123', name: 'Chef Rahman', role: 'kitchen' },
  { email: 'waiter@selagicoffee.my', password: 'waiter123', name: 'Arif', role: 'waiter' },
];
