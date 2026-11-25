import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRestaurantSchema,
  updateRestaurantSchema,
  menuItemSchema,
  updateMenuItemSchema
} from '../src/validation/restaurantSchemas.js';

test('createRestaurantSchema accepts a valid payload with cuisine, location and metadata', () => {
  const payload = {
    name: 'Spice Junction',
    cuisine: 'Indian',
    address: '123 Main Street',
    image: 'https://example.com/spice.jpg',
    isOpen: true,
    rating: 4.8,
    deliveryTime: '25-30 mins',
    costForTwo: 500,
    openingHours: '10:00 AM - 11:00 PM',
    location: {
      lat: 17.3850,
      lng: 78.4867
    }
  };

  const { error, value } = createRestaurantSchema.validate(payload);
  assert.equal(error, undefined);
  assert.equal(value.name, 'Spice Junction');
  assert.equal(value.cuisine, 'Indian');
  assert.equal(value.costForTwo, 500);
});

test('createRestaurantSchema rejects a payload missing required location coordinates', () => {
  const payload = {
    name: 'No Location Kitchen',
    cuisine: 'Fast Food',
    address: '404 Unknown Way'
  };

  const { error } = createRestaurantSchema.validate(payload);
  assert.ok(error, 'expected validation error for missing location');
  assert.match(error.message, /location/i);
});

test('createRestaurantSchema rejects invalid latitude or longitude', () => {
  const payload = {
    name: 'Invalid Geo Kitchen',
    cuisine: 'Fast Food',
    address: '404 Bad Geo Way',
    location: {
      lat: 95.0, // Invalid: lat must be <= 90
      lng: 78.4867
    }
  };

  const { error } = createRestaurantSchema.validate(payload);
  assert.ok(error);
  assert.match(error.message, /lat/i);
});

test('menuItemSchema validates veg flag, price and category', () => {
  const item = {
    name: 'Paneer Butter Masala',
    description: 'Rich cottage cheese in tomato gravy',
    price: 320,
    category: 'Curries',
    isVeg: true,
    available: true,
    rating: 4.9
  };

  const { error, value } = menuItemSchema.validate(item);
  assert.equal(error, undefined);
  assert.equal(value.isVeg, true);
  assert.equal(value.price, 320);
});

test('menuItemSchema rejects negative or zero price', () => {
  const item = {
    name: 'Free Food',
    price: -10
  };

  const { error } = menuItemSchema.validate(item);
  assert.ok(error);
  assert.match(error.message, /price/i);
});

test('updateRestaurantSchema accepts partial updates', () => {
  const update = {
    isOpen: false,
    deliveryTime: '45 mins'
  };

  const { error, value } = updateRestaurantSchema.validate(update);
  assert.equal(error, undefined);
  assert.equal(value.isOpen, false);
});
