/**
 * Gate for endpoints that should only ever be called by another backend
 * service (or an operator tool), never by an end user's browser — even an
 * authenticated one. Two examples that came out of the bug report:
 *   - POST /api/agents/assign should only be triggered by the dispatch
 *     flow, not any logged-in customer who discovers the route.
 *   - The gateway needs to ask Order Service "does this user actually own
 *     this order?" before letting a socket join a tracking room, and that
 *     lookup itself shouldn't be reachable by a regular end-user request.
 *
 * This is a shared-secret header check, not mTLS/service identity — a
 * deliberately lightweight stand-in appropriate for a project running on a
 * single trusted Docker network. A real production deployment would use
 * per-service credentials or a service mesh instead; see README.
 */
export const internalOnly = (req, res, next) => {
  const provided = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET;

  if (!expected) {
    console.error('INTERNAL_SERVICE_SECRET is not set — refusing all internal calls');
    return res.status(500).json({ success: false, message: 'Server misconfiguration' });
  }

  if (!provided || provided !== expected) {
    return res.status(403).json({ success: false, message: 'Internal endpoint' });
  }

  next();
};
