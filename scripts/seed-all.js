/**
 * Seeds one account of each role plus a restaurant with a couple of menu
 * items, so the whole event-driven flow (place order -> restaurant accepts
 * -> agent assigned -> delivered) can be exercised immediately after
 * `docker compose up --build` without manually clicking through signup
 * forms first.
 *
 * Restaurant/agent accounts can no longer be created through public
 * signup (BUG-001) — this script authenticates to the internal
 * register-staff endpoint using INTERNAL_SERVICE_SECRET, the same way a
 * real onboarding/admin tool would.
 *
 * Usage:  node scripts/seed-all.js
 * Env:    GATEWAY_URL (default http://localhost:8080)
 *         INTERNAL_SERVICE_SECRET (must match the one docker-compose.yml
 *         passes to the services — see .env.example)
 */

require("dotenv").config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

if (!INTERNAL_SECRET) {
  console.error('INTERNAL_SERVICE_SECRET is not set — export the same value docker-compose.yml uses.');
  process.exit(1);
}

const request = async (method, path, body, { token, internal } = {}) => {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(internal ? { 'x-internal-secret': INTERNAL_SECRET } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
};

const registerCustomerOrLogin = async (name, email, password) => {
  await request('POST', '/api/users/register', { name, email, password });
  const login = await request('POST', '/api/users/login', { email, password });
  return login.data;
};

const registerStaffOrLogin = async (name, email, password, role) => {
  await request('POST', '/api/users/register-staff', { name, email, password, role }, { internal: true });
  const login = await request('POST', '/api/users/login', { email, password });
  return login.data;
};

const main = async () => {
  console.log(`Seeding against ${GATEWAY_URL} ...`);

  const customer = await registerCustomerOrLogin('Demo Customer', 'customer@example.com', 'password123');
  console.log('customer ready:', customer.user.email);

  const restaurantOwner = await registerStaffOrLogin('Demo Restaurant', 'restaurant@example.com', 'password123', 'restaurant');
  console.log('restaurant account ready:', restaurantOwner.user.email);

  const agent = await registerStaffOrLogin('Demo Agent', 'agent@example.com', 'password123', 'agent');
  console.log('agent account ready:', agent.user.email);

  const admin = await registerStaffOrLogin('Platform Admin', 'admin@example.com', 'password123', 'admin');
  console.log('admin account ready:', admin.user.email);

  // A handful of restaurants across different cuisines, each with a few
  // menu items, clustered a few km apart around the same demo agent so
  // every one of them is actually deliverable in a demo.
  const RESTAURANTS = [
    {
      name: 'Spice Route',
      cuisine: 'Indian',
      address: '12 MG Road, Hyderabad',
      location: { lat: 17.385, lng: 78.4867 },
      rating: 4.8,
      deliveryTime: '25-35 mins',
      costForTwo: 500,
      image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop&q=80',
      menu: [
        { name: 'Paneer Butter Masala', description: 'Rich tomato cashew gravy with soft cottage cheese', price: 220, category: 'Curries', isVeg: true, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&auto=format&fit=crop&q=80' },
        { name: 'Chicken Biryani', description: 'Hyderabadi style, fragrant basmati rice with spiced chicken', price: 280, category: 'Biryani', isVeg: false, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&auto=format&fit=crop&q=80' },
        { name: 'Garlic Naan', description: 'Fresh tandoor-baked flatbread infused with roasted garlic', price: 45, category: 'Breads', isVeg: true, image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=80' },
        { name: 'Gulab Jamun (2 pc)', description: 'Warm milk-solid dumplings soaked in cardamom rose syrup', price: 60, category: 'Desserts', isVeg: true, image: 'https://images.unsplash.com/photo-1605197148784-2191599e036e?w=400&auto=format&fit=crop&q=80' }
      ]
    },
    {
      name: 'Bella Napoli',
      cuisine: 'Italian',
      address: '45 Banjara Hills Road, Hyderabad',
      location: { lat: 17.412, lng: 78.4483 },
      rating: 4.6,
      deliveryTime: '30-40 mins',
      costForTwo: 650,
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80',
      menu: [
        { name: 'Margherita Pizza', description: 'San Marzano tomato, fresh fior di latte mozzarella, basil', price: 320, category: 'Pizza', isVeg: true, image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&auto=format&fit=crop&q=80' },
        { name: 'Fettuccine Alfredo', description: 'Handmade pasta tossed in silky parmesan cream sauce', price: 290, category: 'Pasta', isVeg: true, image: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400&auto=format&fit=crop&q=80' },
        { name: 'Garlic Bread with Cheese', description: 'Crispy baguette with herb butter and melted mozzarella', price: 90, category: 'Starters', isVeg: true, image: 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?w=400&auto=format&fit=crop&q=80' },
        { name: 'Tiramisu', description: 'Traditional Italian espresso-soaked savoiardi with mascarpone', price: 150, category: 'Desserts', isVeg: true, image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&auto=format&fit=crop&q=80' }
      ]
    },
    {
      name: 'Golden Wok',
      cuisine: 'Chinese',
      address: '9 Jubilee Hills Road No. 3, Hyderabad',
      location: { lat: 17.4239, lng: 78.4738 },
      rating: 4.5,
      deliveryTime: '20-30 mins',
      costForTwo: 450,
      image: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=600&auto=format&fit=crop&q=80',
      menu: [
        { name: 'Veg Hakka Noodles', description: 'Wok-tossed noodles with crisp colorful garden vegetables', price: 180, category: 'Noodles', isVeg: true, image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&auto=format&fit=crop&q=80' },
        { name: 'Kung Pao Chicken', description: 'Tender chicken cubes with fiery chilies, peanuts and scallions', price: 260, category: 'Main Course', isVeg: false, image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&auto=format&fit=crop&q=80' },
        { name: 'Spring Rolls (4 pc)', description: 'Crispy vegetable spring rolls served with sweet plum dip', price: 120, category: 'Starters', isVeg: true, image: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&auto=format&fit=crop&q=80' },
        { name: 'Veg Manchurian Gravy', description: 'Crisp veg florets in savory garlic soy reduction', price: 190, category: 'Main Course', isVeg: true, image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80' }
      ]
    },
    {
      name: 'Burger Yard',
      cuisine: 'American',
      address: '3 Road No. 12, Banjara Hills, Hyderabad',
      location: { lat: 17.4156, lng: 78.4347 },
      rating: 4.7,
      deliveryTime: '20-35 mins',
      costForTwo: 400,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
      menu: [
        { name: 'Classic Cheeseburger', description: 'Juicy patty, vintage cheddar, pickles and house secret relish', price: 210, category: 'Burgers', isVeg: false, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&auto=format&fit=crop&q=80' },
        { name: 'Crispy Veggie Deluxe Burger', description: 'Crisp crumbed potato patty, lettuce, cheddar, smoked mayo', price: 170, category: 'Burgers', isVeg: true, image: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&auto=format&fit=crop&q=80' },
        { name: 'Loaded Cheesy Fries', description: 'Crispy skin-on fries drowned in warm cheddar cheese & jalapeños', price: 150, category: 'Sides', isVeg: true, image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=80' },
        { name: 'Rich Chocolate Shake', description: 'Dense Belgian chocolate shake topped with chocolate whipped cream', price: 130, category: 'Beverages', isVeg: true, image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&auto=format&fit=crop&q=80' }
      ]
    }
  ];

  for (const r of RESTAURANTS) {
    const restaurant = await request(
      'POST',
      '/api/restaurants',
      {
        name: r.name,
        cuisine: r.cuisine,
        address: r.address,
        isOpen: true,
        location: r.location,
        rating: r.rating,
        deliveryTime: r.deliveryTime,
        costForTwo: r.costForTwo,
        image: r.image
      },
      { token: restaurantOwner.token }
    );

    const restaurantId = restaurant.data?._id;

    if (!restaurantId) {
      console.log(`${r.name} already existed — skipped menu seeding`);
      continue;
    }

    for (const item of r.menu) {
      await request('POST', `/api/restaurants/${restaurantId}/menu`, item, { token: restaurantOwner.token });
    }
    console.log(`${r.name} + ${r.menu.length} menu items ready:`, restaurantId);
  }

  await request('PUT', '/api/agents/profile', { name: 'Demo Agent', phone: '9999999999', vehicleType: 'bike' }, { token: agent.token });
  await request('PATCH', '/api/agents/status', { online: true }, { token: agent.token });
  await request('PATCH', '/api/agents/location', { longitude: 78.4867, latitude: 17.385 }, { token: agent.token });
  console.log('agent profile ready and online near the demo restaurant');

  console.log('\nSeed complete. Demo Accounts:');
  console.log('  Customer:   customer@example.com   / password123');
  console.log('  Restaurant: restaurant@example.com / password123');
  console.log('  Agent:      agent@example.com      / password123');
  console.log('  Admin:      admin@example.com      / password123');
};

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
