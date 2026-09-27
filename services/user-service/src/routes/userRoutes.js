import { Router } from 'express';
import { login, profile, register, registerStaff } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { loginSchema, registerSchema, registerStaffSchema, validateBody } from '../validation/userSchemas.js';
import { internalOnly } from '../../../../shared/auth/internalOnly.js';

const router = Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/register-staff', internalOnly, validateBody(registerStaffSchema), registerStaff);
router.post('/login', validateBody(loginSchema), login);
router.get('/profile', protect, profile);

export default router;
