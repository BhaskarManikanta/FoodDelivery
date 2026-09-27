import { Router } from 'express';
import {
  addMenuItem,
  createRestaurant,
  deleteMenuItem,
  deleteRestaurant,
  getMyRestaurants,
  getRestaurantById,
  getRestaurants,
  searchRestaurants,
  updateMenuItem,
  updateRestaurant
} from '../controllers/restaurantController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import {
  createRestaurantSchema,
  menuItemSchema,
  updateMenuItemSchema,
  updateRestaurantSchema,
  validateBody
} from '../validation/restaurantSchemas.js';

const router = Router();

// NOTE: /mine and /search must be declared before the /:id route — Express
// matches routes top-down, so if /:id came first it would swallow "mine"
// and "search" as if they were restaurant IDs.
router.get('/mine', protect, allowRoles('restaurant'), getMyRestaurants);
router.get('/search', searchRestaurants);

router.get('/', getRestaurants);
router.get('/:id', getRestaurantById);

router.post('/', protect, allowRoles('restaurant'), validateBody(createRestaurantSchema), createRestaurant);
router.patch('/:id', protect, allowRoles('restaurant'), validateBody(updateRestaurantSchema), updateRestaurant);
router.delete('/:id', protect, allowRoles('restaurant'), deleteRestaurant);

router.post(
  '/:restaurantId/menu',
  protect,
  allowRoles('restaurant'),
  validateBody(menuItemSchema),
  addMenuItem
);
router.patch(
  '/:restaurantId/menu/:itemId',
  protect,
  allowRoles('restaurant'),
  validateBody(updateMenuItemSchema),
  updateMenuItem
);
router.delete('/:restaurantId/menu/:itemId', protect, allowRoles('restaurant'), deleteMenuItem);

export default router;
