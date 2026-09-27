import asyncHandler from 'express-async-handler';
import Redis from 'ioredis';
import Restaurant from '../models/Restaurant.js';

const redis = new Redis(process.env.REDIS_URL);

const invalidateRestaurantCaches = async (restaurantId) => {
  // Paginated cache keys (restaurants:all:<page>:<limit>) — clear every
  // page rather than trying to track which ones are stale.
  const keys = await redis.keys('restaurants:all:*');
  if (keys.length) await redis.del(...keys);
  if (restaurantId) {
    await redis.del(`restaurant:${restaurantId}`);
  }
};

export const createRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.create({
    ...req.body,
    ownerId: req.user.id
  });

  // Was previously missing: without this, a brand-new restaurant wouldn't
  // show up in GET /api/restaurants for up to 60s if the list was already
  // cached at creation time.
  await invalidateRestaurantCaches();

  res.status(201).json({
    success: true,
    data: restaurant
  });
});

export const getRestaurants = asyncHandler(async (req, res) => {
  // BUG-040: unbounded results. Cache key includes the page so different
  // pages don't collide on the same cached blob.
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const cacheKey = `restaurants:all:${page}:${limit}`;

  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    return res.status(200).json({ success: true, ...JSON.parse(cachedData), cached: true });
  }

  const [restaurants, total] = await Promise.all([
    Restaurant.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Restaurant.countDocuments()
  ]);

  const payload = { data: restaurants, page, limit, total };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);

  res.status(200).json({ success: true, ...payload });
});

export const getMyRestaurants = asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ ownerId: req.user.id }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: restaurants
  });
});

export const getRestaurantById = asyncHandler(async (req, res) => {
  const cacheKey = `restaurant:${req.params.id}`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return res.status(200).json({
      success: true,
      data: JSON.parse(cachedData),
      cached: true
    });
  }

  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  await redis.set(cacheKey, JSON.stringify(restaurant), 'EX', 60);

  res.status(200).json({
    success: true,
    data: restaurant
  });
});

export const updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({ success: false, message: 'Restaurant not found' });
  }

  if (restaurant.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'You can only edit your own restaurant' });
  }

  const { name, cuisine, address, image, isOpen, location } = req.body;

  if (name !== undefined) restaurant.name = name;
  if (cuisine !== undefined) restaurant.cuisine = cuisine;
  if (address !== undefined) restaurant.address = address;
  if (image !== undefined) restaurant.image = image;
  if (isOpen !== undefined) restaurant.isOpen = isOpen;
  if (location !== undefined) restaurant.location = location;

  await restaurant.save();
  await invalidateRestaurantCaches(restaurant._id);

  res.status(200).json({ success: true, data: restaurant });
});

export const deleteRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({ success: false, message: 'Restaurant not found' });
  }

  if (restaurant.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'You can only delete your own restaurant' });
  }

  await restaurant.deleteOne();
  await invalidateRestaurantCaches(restaurant._id);

  res.status(200).json({ success: true, message: 'Restaurant deleted' });
});

export const addMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.restaurantId);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  if (restaurant.ownerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You can only edit your own restaurant'
    });
  }

  restaurant.menu.push(req.body);
  await restaurant.save();

  await invalidateRestaurantCaches(restaurant._id);

  res.status(201).json({
    success: true,
    data: restaurant
  });
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.restaurantId);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  if (restaurant.ownerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You can only edit your own restaurant'
    });
  }

  const item = restaurant.menu.id(req.params.itemId);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  Object.assign(item, req.body);
  await restaurant.save();

  await invalidateRestaurantCaches(restaurant._id);

  res.status(200).json({
    success: true,
    data: restaurant
  });
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.restaurantId);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: 'Restaurant not found'
    });
  }

  if (restaurant.ownerId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You can only edit your own restaurant'
    });
  }

  const item = restaurant.menu.id(req.params.itemId);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Menu item not found'
    });
  }

  item.deleteOne();
  await restaurant.save();

  await invalidateRestaurantCaches(restaurant._id);

  res.status(200).json({
    success: true,
    data: restaurant
  });
});

export const searchRestaurants = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').slice(0, 100); // guard against pathological/huge regex input
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  // BUG-039: a leading-wildcard case-insensitive regex can't use a normal
  // index and scans the whole collection. A hard result cap + pagination
  // bounds the damage at this project's scale; a real fix at larger scale
  // would move this to a dedicated text/search index (Mongo Atlas Search,
  // Elasticsearch) instead of an in-collection regex scan.
  const filter = q
    ? {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { cuisine: { $regex: q, $options: 'i' } },
          { 'menu.name': { $regex: q, $options: 'i' } }
        ]
      }
    : {};

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Restaurant.countDocuments(filter)
  ]);

  res.status(200).json({ success: true, data: restaurants, page, limit, total });
});
