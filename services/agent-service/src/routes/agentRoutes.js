import { Router } from 'express';
import {
  assignNearestAgent,
  createOrUpdateProfile,
  findNearestAgents,
  getAgentPublicDetails,
  getAllAgentsAdmin,
  getMyProfile,
  getMyStatus,
  setOnlineStatus,
  updateLocation
} from '../controllers/agentController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

router.put('/profile', protect, allowRoles('agent', 'admin'), createOrUpdateProfile);
router.get('/profile/me', protect, allowRoles('agent', 'admin'), getMyProfile);
router.get('/status/me', protect, allowRoles('agent', 'admin'), getMyStatus);
router.patch('/status', protect, allowRoles('agent', 'admin'), setOnlineStatus);
router.patch('/location', protect, allowRoles('agent', 'admin'), updateLocation);
router.get('/details/:agentId', protect, getAgentPublicDetails);
router.get('/all', protect, allowRoles('admin'), getAllAgentsAdmin);

// BUG-006 / BUG-023: these are dispatch-flow operations, not end-user
// operations — restricted to service-to-service calls carrying the shared
// internal secret, not just "any authenticated user."
router.get('/nearby', internalOnly, findNearestAgents);
router.post('/assign', internalOnly, assignNearestAgent);

export default router;
