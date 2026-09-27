/**
 * Shared JSON error contract for every service. Every response in this API
 * — success or failure — is supposed to have the shape { success, ... }.
 * Without this, an unhandled Mongoose error (duplicate key, validation
 * failure, bad ObjectId) falls through to Express's default handler, which
 * returns an HTML stack-trace page instead of JSON. Mount this LAST, after
 * every route, in every service's server.js.
 */
export const errorHandler = (err, req, res, next) => {
  console.error(`[${process.env.SERVICE_NAME || 'service'}] Unhandled error:`, err);

  // Mongoose duplicate key (e.g. two accounts racing to register the same email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already in use`
    });
  }

  // Mongoose schema validation failure
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
    return res.status(400).json({ success: false, message });
  }

  // Malformed ObjectId in a route param (e.g. GET /api/orders/not-a-real-id)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}` });
  }

  // A stray JWT error that wasn't already caught by an auth middleware
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message
  });
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};
