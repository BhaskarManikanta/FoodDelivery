import { Router } from 'express';
import {
  cancelOrder,
  createOrder,
  getAgentOrders,
  getAllOrdersAdmin,
  getMyOrders,
  getOrderById,
  authorizeTrackingAccess,
  getRestaurantOrders,
  restaurantDecision,
  restaurantUpdateStatus,
  updateOrderStatus
} from '../controllers/orderController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

// NOTE: these scoped-listing routes must come before /:id, or Express
// would match "my-orders" etc. as if they were an order id.
router.get('/my-orders', protect, allowRoles('customer'), getMyOrders);
router.get('/restaurant/mine', protect, allowRoles('restaurant', 'admin'), getRestaurantOrders);
router.get('/agent/mine', protect, allowRoles('agent', 'admin'), getAgentOrders);
router.get('/admin/all', protect, allowRoles('admin'), getAllOrdersAdmin);

router.post('/', protect, allowRoles('customer', 'admin'), createOrder);
router.get('/internal/:id/tracking-access', internalOnly, authorizeTrackingAccess);
router.get('/:id', protect, getOrderById);

// Restaurant workflow
router.patch('/:id/restaurant-decision', protect, allowRoles('restaurant', 'admin'), restaurantDecision);
router.patch('/:id/restaurant-status', protect, allowRoles('restaurant', 'admin'), restaurantUpdateStatus);

// Agent workflow
router.patch('/:id/status', protect, allowRoles('agent', 'admin'), updateOrderStatus);

// Customer cancellation
router.patch('/:id/cancel', protect, allowRoles('customer', 'admin'), cancelOrder);

export default router;
