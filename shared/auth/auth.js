import jwt from 'jsonwebtoken';

export const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const extractUserFromHeader = (authorizationHeader) => {
  if (!authorizationHeader) return null;

  const token = authorizationHeader.split(' ')[1];
  return verifyToken(token);
};

export const hasRole = (user, ...roles) => {
  return user && roles.includes(user.role);
};