import asyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// BUG-001: public registration always creates a `customer` account — the
// role isn't even accepted as input here (registerSchema doesn't define
// it, so Joi strips it). See registerStaff below for how restaurant/agent
// accounts get created instead.
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'User already exists'
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    role: 'customer'
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token: generateToken(user)
    }
  });
});

// Gated by the internalOnly middleware at the route level — never exposed
// to public signup. Creates a restaurant-owner or delivery-agent account.
export const registerStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'User already exists'
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    role
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token: generateToken(user)
    }
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  const isMatched = await bcrypt.compare(password, user.password);

  if (!isMatched) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token: generateToken(user)
    }
  });
});

export const profile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.status(200).json({
    success: true,
    data: user
  });
});
