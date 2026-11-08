// Sample data for the initial demo. Used by the demo backend on first run and
// by `scripts/seed-firestore.mjs` to bootstrap a fresh Firebase project.

export const DEFAULT_SETTINGS = {
  id: 'general',
  restaurantName: 'Eden Hall',
  tagline: 'Your favourite neighbourhood cafe',
  heroTitle: 'Ramadhan Nights',
  logo: null,
  banner: null,
  address: 'No. 12, Jalan Eden, 50450 Kuala Lumpur',
  phone: '+60 12-345 6789',
  email: 'hello@edenhall.my',
  openingHours: 'Daily · 8:00 AM – 11:00 PM',
  currency: 'RM',
  timezoneOffset: 8,
  orderPrefix: 'EH',
  memberPrefix: 'EH',
  acceptingOrders: true,
  serviceChargeRate: 0.1,
  taxEnabled: true,
  taxRate: 0.06,
  pickupLeadMinutes: 15,
  paymentMethods: { cash: true, duitnow: true, online: false },
  duitnowName: 'EDEN HALL SDN BHD',
  duitnowId: '1234567890',
  duitnowQr: null,
  gateway: { provider: 'billplz', enabled: false },
  pointsPerRM: 10,
  tierWindowDays: 90,
  tiers: [
    { id: 'classic', name: 'Classic', min: 0, multiplier: 1, color: '#9aa6a1', perks: ['Earn 10 pts per RM1', 'Birthday treat'] },
    { id: 'silver', name: 'Silver', min: 2000, multiplier: 1.2, color: '#b8c2c8', perks: ['1.2× points', 'Free upsize monthly', 'Priority pickup'] },
    { id: 'gold', name: 'Gold', min: 5000, multiplier: 1.5, color: '#D5B46A', perks: ['1.5× points', 'Free dessert monthly', 'Members-only menu'] },
    { id: 'platinum', name: 'Platinum', min: 10000, multiplier: 2, color: '#e5e4e2', perks: ['2× points', 'Free drink weekly', 'Private event invites'] },
  ],
  referralBonus: 500,
  checkInPoints: 10,
  profileBonus: 75,
  promotions: [
    { id: 'p1', title: 'Iftar Set for Two', subtitle: 'Main + drinks + dessert · RM 59', badge: 'Ramadhan', color: '#123D32' },
    { id: 'p2', title: 'Happy Hour Coffee', subtitle: '20% off all coffee · 3–5 PM', badge: 'Daily', color: '#7a4a2a' },
    { id: 'p3', title: 'Double Points Weekend', subtitle: 'Earn 2× points every Sat & Sun', badge: 'Members', color: '#8a6d2b' },
  ],
};

export const CATEGORIES = [
  { id: 'main', name: 'Main Course', icon: '🍽️', type: 'food', sort: 1 },
  { id: 'western', name: 'Western Food', icon: '🍔', type: 'food', sort: 2 },
  { id: 'local', name: 'Local Food', icon: '🍛', type: 'food', sort: 3 },
  { id: 'snacks', name: 'Snacks', icon: '🍟', type: 'food', sort: 4 },
  { id: 'desserts', name: 'Desserts', icon: '🍰', type: 'food', sort: 5 },
  { id: 'beverages', name: 'Beverages', icon: '🥤', type: 'beverage', sort: 6 },
  { id: 'coffee', name: 'Coffee', icon: '☕', type: 'beverage', sort: 7 },
  { id: 'signature', name: 'Signature Drinks', icon: '🍹', type: 'beverage', sort: 8 },
].map((c) => ({ ...c, active: true }));

const sizes = [{ id: 'reg', name: 'Regular', price: 0 }, { id: 'lg', name: 'Large', price: 2 }];
const temp = [{ id: 'hot', name: 'Hot', price: 0 }, { id: 'iced', name: 'Iced', price: 1 }];
const doneness = [{ id: 'mr', name: 'Medium Rare', price: 0 }, { id: 'm', name: 'Medium', price: 0 }, { id: 'wd', name: 'Well Done', price: 0 }];
const milk = [{ id: 'oat', name: 'Oat milk', price: 2 }, { id: 'shot', name: 'Extra shot', price: 2.5 }, { id: 'syrup', name: 'Vanilla syrup', price: 1.5 }];
const sides = [{ id: 'egg', name: 'Fried egg', price: 2 }, { id: 'cheese', name: 'Extra cheese', price: 3 }, { id: 'fries', name: 'Side fries', price: 6 }];

const M = (id, name, categoryId, price, image, description, extra = {}) => ({
  id, name, categoryId, price, image, description, available: true, featured: false, soldCount: 0,
  variants: [], addons: [], tags: [], ...extra,
});

export const MENU = [
  M('wagyu-burger', 'Wagyu Burger', 'western', 28, 'art:burger', 'Juicy wagyu patty, aged cheddar, caramelised onion and house sauce on a toasted brioche, served with fries.', { featured: true, addons: sides, tags: ['Bestseller'], soldCount: 42 }),
  M('wagyu-sirloin', 'Wagyu Sirloin Steak', 'main', 99, 'art:steak', '250g wagyu sirloin, grilled asparagus, cherry tomatoes and black pepper jus.', { featured: true, variants: doneness, stockLeft: 6, tags: ['Chef pick'], soldCount: 12 }),
  M('crispy-chicken', 'Crispy Chicken Chop', 'western', 20, 'art:chicken', 'Golden fried boneless chicken thigh with fries, coleslaw and mushroom sauce.', { addons: sides, soldCount: 38 }),
  M('fish-chips', 'Fish and Chips', 'western', 25, 'art:fishchips', 'Beer-battered dory, chunky fries, tartar sauce and lemon.', { soldCount: 21 }),
  M('char-bonara', 'Char-Bonara Chicken', 'main', 24, 'art:pasta', 'Smoky creamy carbonara with grilled chicken, beef bacon and parmesan.', { featured: true, addons: [{ id: 'parm', name: 'Extra parmesan', price: 2 }, { id: 'chk', name: 'Extra chicken', price: 5 }], soldCount: 30 }),
  M('tomyam-seafood', 'Creamy Tomyam Seafood', 'main', 28, 'art:noodle', 'Spaghetti in a creamy tomyam sauce with prawns, mussels and squid.', { variants: [{ id: 'mild', name: 'Mild', price: 0 }, { id: 'spicy', name: 'Spicy', price: 0 }, { id: 'xspicy', name: 'Extra spicy', price: 0 }], soldCount: 26 }),
  M('aglio-beef', 'Aglio Olio Beef', 'main', 24, 'art:pasta', 'Garlic and chilli olive oil spaghetti with sliced beef bacon.', { soldCount: 18 }),
  M('nasi-lemak', 'Nasi Lemak Ayam Rempah', 'local', 18, 'art:nasi', 'Coconut rice, spiced fried chicken, sambal, egg, anchovies and peanuts.', { featured: true, addons: [{ id: 'egg', name: 'Extra egg', price: 2 }, { id: 'sambal', name: 'Extra sambal', price: 1.5 }], tags: ['Local fave'], soldCount: 55 }),
  M('mee-goreng', 'Mee Goreng Mamak', 'local', 15, 'art:noodle', 'Wok-fried yellow noodles with prawns, tofu and egg.', { variants: [{ id: 'mild', name: 'Mild', price: 0 }, { id: 'spicy', name: 'Spicy', price: 0 }], soldCount: 22 }),
  M('sup-tulang', 'Sup Tulang Merah', 'local', 22, 'art:soup', 'Slow-cooked beef bone in a rich red spiced broth with bread.', { soldCount: 9 }),
  M('eggs-toast', 'Eden Big Breakfast', 'main', 26, 'art:toast', 'Sourdough toast, sunny eggs, chicken sausage, hash brown and sautéed mushrooms.', { soldCount: 14 }),
  M('truffle-fries', 'Truffle Fries', 'snacks', 14, 'art:fries', 'Shoestring fries tossed in truffle oil and parmesan.', { soldCount: 40 }),
  M('buffalo-wings', 'Buffalo Wings (6pcs)', 'snacks', 18, 'art:wings', 'Spicy buffalo wings with blue cheese dip.', { soldCount: 19 }),
  M('caesar', 'Grilled Chicken Caesar', 'snacks', 19, 'art:salad', 'Romaine, grilled chicken, croutons, parmesan and caesar dressing.', { soldCount: 7 }),
  M('choc-cake', 'Dark Chocolate Cake', 'desserts', 14, 'art:cake', 'Rich layered dark chocolate cake with ganache.', { featured: true, soldCount: 16 }),
  M('waffle', 'Berry Waffle', 'desserts', 16, 'art:waffle', 'Buttermilk waffle, vanilla ice cream and mixed berries.', { soldCount: 11 }),
  M('latte', 'Café Latte', 'coffee', 11, 'art:coffee', 'Double shot espresso with silky steamed milk.', { variants: temp, addons: milk, soldCount: 60 }),
  M('americano', 'Americano', 'coffee', 9, 'art:coffee', 'Bold espresso with hot water.', { variants: temp, addons: milk, soldCount: 33 }),
  M('spanish-latte', 'Spanish Latte', 'coffee', 13, 'art:iced', 'Condensed-milk sweetened latte, served iced.', { variants: sizes, addons: milk, featured: true, soldCount: 47 }),
  M('teh-tarik', 'Teh Tarik', 'beverages', 6, 'art:tea', 'Pulled milk tea, frothy and sweet.', { variants: temp, soldCount: 52 }),
  M('orange-juice', 'Fresh Orange Juice', 'beverages', 12, 'art:juice', 'Freshly squeezed oranges, no sugar added.', { variants: sizes, soldCount: 15 }),
  M('iced-matcha', 'Iced Matcha Latte', 'signature', 15, 'art:matcha', 'Ceremonial-grade matcha with fresh milk over ice.', { variants: sizes, addons: [{ id: 'oat', name: 'Oat milk', price: 2 }], featured: true, soldCount: 29 }),
  M('eden-sunset', 'Eden Sunset', 'signature', 14, 'art:juice', 'Passion fruit, orange and sparkling soda with a grenadine sunset.', { tags: ['Signature'], soldCount: 24 }),
  M('rose-bandung', 'Rose Bandung Float', 'signature', 12, 'art:iced', 'Rose syrup and milk with a scoop of vanilla ice cream.', { soldCount: 8 }),
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
  { id: 'rw-cake', name: 'Free Chocolate Cake', description: 'A slice of our dark chocolate cake on us.', cost: 1200, type: 'item', value: 0, menuId: 'choc-cake', itemName: 'Dark Chocolate Cake', minSpend: 0, icon: '🍰', validDays: 30, active: true },
  { id: 'rw-rm20', name: 'RM20 Off', description: 'RM20 off orders above RM80. Gold & above.', cost: 3000, type: 'amount', value: 20, minSpend: 80, minTier: 'gold', icon: '👑', validDays: 30, active: true },
];

export const DEMO_STAFF = [
  { email: 'admin@edenhall.my', password: 'admin123', name: 'Aisyah (Owner)', role: 'super_admin' },
  { email: 'manager@edenhall.my', password: 'manager123', name: 'Daniel Lim', role: 'manager' },
  { email: 'cashier@edenhall.my', password: 'cashier123', name: 'Mei Ling', role: 'cashier' },
  { email: 'kitchen@edenhall.my', password: 'kitchen123', name: 'Chef Rahman', role: 'kitchen' },
  { email: 'waiter@edenhall.my', password: 'waiter123', name: 'Arif', role: 'waiter' },
];
