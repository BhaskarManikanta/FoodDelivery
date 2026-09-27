import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      success: false,
      message: 'Missing token'
    });
  }

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-jwt-key');
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

export const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden'
      });
    }
    next();
  };
};