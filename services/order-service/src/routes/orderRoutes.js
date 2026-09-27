import { Router } from 'express';
import {
  cancelOrder,
  createOrder,
  getAgentOrders,
  getMyOrders,
  getOrderById,
  authorizeTrackingAccess,
  getRestaurantOrders,
  updateOrderStatus
} from '../controllers/orderController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

// NOTE: these scoped-listing routes must come before /:id, or Express
// would match "my-orders" etc. as if they were an order id.
router.get('/my-orders', protect, allowRoles('customer'), getMyOrders);
router.get('/restaurant/mine', protect, allowRoles('restaurant'), getRestaurantOrders);
router.get('/agent/mine', protect, allowRoles('agent'), getAgentOrders);

router.post('/', protect, allowRoles('customer'), createOrder);
router.get('/internal/:id/tracking-access', internalOnly, authorizeTrackingAccess);
router.get('/:id', protect, getOrderById);
router.patch('/:id/status', protect, allowRoles('agent'), updateOrderStatus);
router.patch('/:id/cancel', protect, allowRoles('customer'), cancelOrder);

export default router;
