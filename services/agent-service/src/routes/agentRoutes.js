import { Router } from 'express';
import {
  assignNearestAgent,
  createOrUpdateProfile,
  findNearestAgents,
  getMyProfile,
  setOnlineStatus,
  updateLocation
} from '../controllers/agentController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

router.put('/profile', protect, allowRoles('agent'), createOrUpdateProfile);
router.get('/profile/me', protect, allowRoles('agent'), getMyProfile);
router.patch('/status', protect, allowRoles('agent'), setOnlineStatus);
router.patch('/location', protect, allowRoles('agent'), updateLocation);

// BUG-006 / BUG-023: these are dispatch-flow operations, not end-user
// operations — restricted to service-to-service calls carrying the shared
// internal secret, not just "any authenticated user."
router.get('/nearby', internalOnly, findNearestAgents);
router.post('/assign', internalOnly, assignNearestAgent);

export default router;
