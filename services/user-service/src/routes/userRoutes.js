import { Router } from 'express';
import {
  getAllUsers,
  getUserStats,
  login,
  profile,
  register,
  registerStaff,
  updateProfile,
  updateUserRole
} from '../controllers/userController.js';
import { allowRoles, protect } from '../middleware/auth.js';
import {
  loginSchema,
  registerSchema,
  registerStaffSchema,
  updateProfileSchema,
  validateBody
} from '../validation/userSchemas.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/register-staff', internalOnly, validateBody(registerStaffSchema), registerStaff);
router.post('/login', validateBody(loginSchema), login);
router.get('/profile', protect, profile);
router.put('/profile', protect, validateBody(updateProfileSchema), updateProfile);

// Admin routes
router.get('/stats', protect, allowRoles('admin'), getUserStats);
router.get('/', protect, allowRoles('admin'), getAllUsers);
router.patch('/:id/role', protect, allowRoles('admin'), updateUserRole);

export default router;
