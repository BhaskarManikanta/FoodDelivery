import Joi from 'joi';

// BUG-001: public registration can ONLY ever create a customer account —
// role is not even an accepted field here (Joi strips unknown keys, so a
// client sending "role": "restaurant" or "agent" has it silently dropped,
// not honored). Restaurant/agent accounts are created through
// registerStaffSchema below, which is gated by the internal-secret
// middleware, not exposed to public signup at all.
export const registerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(6).max(72).required()
});

// Used only by POST /api/users/register-staff, which requires the shared
// internal secret (see shared/auth/internalOnly.js). This project has no
// admin dashboard/approval UI, so this is the demo-appropriate stand-in for
// "restaurant/agent accounts require protected admin or verified
// onboarding" — a real product would replace this with an actual
// invite-token or manual-verification flow.
export const registerStaffSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(6).max(72).required(),
  role: Joi.string().valid('restaurant', 'agent').required()
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required()
});

// Rejects anything that isn't a plain string/number/boolean before it can
// reach a Mongoose query — without this, a body like
// { "email": { "$ne": null } } would be passed straight into
// User.findOne({ email }), and MongoDB would happily treat that object as
// a query operator instead of a value.
export const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details.map((d) => d.message).join(', ')
    });
  }

  req.body = value;
  next();
};
