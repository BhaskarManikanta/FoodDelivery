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

  // A handful of restaurants across different cuisines, each with a few
  // menu items, clustered a few km apart around the same demo agent so
  // every one of them is actually deliverable in a demo.
  const RESTAURANTS = [
    {
      name: 'Spice Route',
      cuisine: 'Indian',
      address: '12 MG Road',
      location: { lat: 17.385, lng: 78.4867 },
      menu: [
        { name: 'Paneer Butter Masala', description: 'Rich tomato gravy', price: 220, category: 'Main' },
        { name: 'Chicken Biryani', description: 'Hyderabadi style, slow-cooked', price: 280, category: 'Main' },
        { name: 'Garlic Naan', description: 'Tandoor baked', price: 45, category: 'Bread' },
        { name: 'Gulab Jamun (2 pc)', description: 'Warm syrup-soaked dumplings', price: 60, category: 'Dessert' }
      ]
    },
    {
      name: 'Bella Napoli',
      cuisine: 'Italian',
      address: '45 Banjara Hills Road',
      location: { lat: 17.412, lng: 78.4483 },
      menu: [
        { name: 'Margherita Pizza', description: 'San Marzano tomato, fior di latte', price: 320, category: 'Main' },
        { name: 'Fettuccine Alfredo', description: 'Parmesan cream sauce', price: 290, category: 'Main' },
        { name: 'Garlic Bread', description: 'With herb butter', price: 90, category: 'Starter' },
        { name: 'Tiramisu', description: 'Espresso-soaked, mascarpone', price: 150, category: 'Dessert' }
      ]
    },
    {
      name: 'Golden Wok',
      cuisine: 'Chinese',
      address: '9 Jubilee Hills Road No. 3',
      location: { lat: 17.4239, lng: 78.4738 },
      menu: [
        { name: 'Veg Hakka Noodles', description: 'Wok-tossed with vegetables', price: 180, category: 'Main' },
        { name: 'Kung Pao Chicken', description: 'Peanuts, dried chilies', price: 260, category: 'Main' },
        { name: 'Spring Rolls (4 pc)', description: 'Crispy, sweet chili dip', price: 120, category: 'Starter' },
        { name: 'Veg Manchurian', description: 'Gravy style', price: 190, category: 'Main' }
      ]
    },
    {
      name: 'Burger Yard',
      cuisine: 'American',
      address: '3 Road No. 12, Banjara Hills',
      location: { lat: 17.4156, lng: 78.4347 },
      menu: [
        { name: 'Classic Cheeseburger', description: 'Beef patty, cheddar, house sauce', price: 210, category: 'Main' },
        { name: 'Crispy Chicken Burger', description: 'Buttermilk-fried, slaw', price: 230, category: 'Main' },
        { name: 'Loaded Fries', description: 'Cheese, jalapeños, bacon bits', price: 150, category: 'Sides' },
        { name: 'Chocolate Shake', description: 'Thick and cold', price: 130, category: 'Beverage' }
      ]
    }
  ];

  for (const r of RESTAURANTS) {
    const restaurant = await request(
      'POST',
      '/api/restaurants',
      { name: r.name, cuisine: r.cuisine, address: r.address, isOpen: true, location: r.location },
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

  console.log('\nSeed complete. Log in as customer@example.com / password123 and place an order against any of the 4 seeded restaurants.');
};

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
