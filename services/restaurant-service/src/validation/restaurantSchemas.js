import Joi from 'joi';

export const createRestaurantSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  cuisine: Joi.string().trim().min(1).required(),
  address: Joi.string().trim().min(1).required(),
  image: Joi.string().uri().allow('').optional(),
  isOpen: Joi.boolean().optional(),
  // BUG-024: required, not optional — a restaurant can't be dispatched to
  // without a real location, so it shouldn't be possible to create one
  // that silently defaults to (0, 0).
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).required()
});

export const updateRestaurantSchema = Joi.object({
  name: Joi.string().trim().min(1),
  cuisine: Joi.string().trim().min(1),
  address: Joi.string().trim().min(1),
  image: Joi.string().uri().allow(''),
  isOpen: Joi.boolean(),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180)
  })
}).min(1);

export const menuItemSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  description: Joi.string().allow('').optional(),
  price: Joi.number().positive().required(),
  category: Joi.string().trim().optional(),
  image: Joi.string().uri().allow('').optional(),
  available: Joi.boolean().optional()
});

export const updateMenuItemSchema = Joi.object({
  name: Joi.string().trim().min(1),
  description: Joi.string().allow(''),
  price: Joi.number().positive(),
  category: Joi.string().trim(),
  image: Joi.string().uri().allow(''),
  available: Joi.boolean()
}).min(1);

// Generic Express middleware factory — validates req.body against a Joi
// schema and returns a clean 400 instead of letting bad data reach Mongoose
// (or worse, get saved as-is).
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
