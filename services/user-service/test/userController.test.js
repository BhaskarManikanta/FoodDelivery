import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';

// Mocks the DB layer only — everything else (bcrypt hashing, JWT signing,
// validation) runs for real. This is what makes it a genuine unit test of
// the controller's own logic rather than a smoke test of Mongo.
const fakeUsers = [];

mock.module('../src/models/User.js', {
  defaultExport: {
    findOne: async ({ email }) => fakeUsers.find((u) => u.email === email) || null,
    create: async (doc) => {
      const user = { _id: `id-${fakeUsers.length + 1}`, ...doc };
      fakeUsers.push(user);
      return user;
    }
  }
});

const { register, login } = await import('../src/controllers/userController.js');

const fakeRes = () => {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('register creates a customer and returns a token', async () => {
  fakeUsers.length = 0;
  const req = { body: { name: 'Test User', email: 'Test@Example.com', password: 'password123' } };
  const res = fakeRes();

  await register(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.user.role, 'customer');
  // Case-insensitive storage check (BUG-001-adjacent fix from earlier)
  assert.equal(res.body.data.user.email, 'test@example.com');
  assert.ok(res.body.data.token, 'expected a JWT to be returned');
  assert.equal(fakeUsers.length, 1);
  assert.notEqual(fakeUsers[0].password, 'password123', 'password must be hashed, not stored plain');
});

test('register rejects a duplicate email (case-insensitively)', async () => {
  fakeUsers.length = 0;
  fakeUsers.push({ _id: 'id-1', email: 'test@example.com', password: 'hashed', role: 'customer' });

  const req = { body: { name: 'Another', email: 'TEST@EXAMPLE.COM', password: 'password123' } };
  const res = fakeRes();

  await register(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
});

test('login succeeds with correct credentials, email typed in a different case', async () => {
  fakeUsers.length = 0;
  // Pre-register through the real register() so the stored hash is real.
  const regReq = { body: { name: 'Test User', email: 'test@example.com', password: 'password123' } };
  await register(regReq, fakeRes(), (err) => { if (err) throw err; });

  const req = { body: { email: 'Test@Example.com', password: 'password123' } };
  const res = fakeRes();

  await login(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.data.user.email, 'test@example.com');
  assert.ok(res.body.data.token);
});

test('login rejects a wrong password', async () => {
  fakeUsers.length = 0;
  const regReq = { body: { name: 'Test User', email: 'test@example.com', password: 'password123' } };
  await register(regReq, fakeRes(), (err) => { if (err) throw err; });

  const req = { body: { email: 'test@example.com', password: 'wrong-password' } };
  const res = fakeRes();

  await login(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 401);
});

test('login rejects an unknown email', async () => {
  fakeUsers.length = 0;
  const req = { body: { email: 'nobody@example.com', password: 'password123' } };
  const res = fakeRes();

  await login(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 401);
});
