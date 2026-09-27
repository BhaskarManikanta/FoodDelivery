# Food Delivery Microservices

An event-driven food ordering platform built with React, Node.js, MongoDB, Redis, Kafka, Socket.IO, and Docker Compose. It demonstrates API gateway routing, JWT auth, Redis caching + GEO queries, a choreography-based saga across services with compensating transactions, an outbox pattern for safe Kafka publishing, and idempotent, dead-letter-protected consumers.

## Architecture

- **Frontend**: React + Redux Toolkit (cart) + React Router + Axios + Socket.IO client
- **Gateway**: Express proxy with JWT auth (including a Socket.IO handshake auth layer), tiered Redis-backed rate limiting, and the single client-facing Socket.IO server for live order tracking
- **User Service**: registration (customer-only), a separate internal-secret-gated staff registration path for restaurant/agent accounts, login, JWT issuing
- **Restaurant Service**: restaurant + menu CRUD, Redis-cached paginated reads, and a Kafka consumer that accepts/rejects new orders
- **Order Service**: owns the order lifecycle end-to-end through an explicit state machine — computes price server-side from the real menu, runs a transactional outbox for every event it publishes, and reacts to every downstream fact via idempotent, at-least-once-safe consumers
- **Agent Service**: Redis GEO for live agent locations, an atomic (Lua-script) nearest-agent reservation with a self-expiring lease, and a Kafka consumer that auto-assigns an agent the moment a restaurant accepts (and releases the agent again on any terminal order outcome)
- **Notification Service**: consumes every event in the lifecycle and simulates email/push/SMS notifications, with duplicate-delivery protection
- **Infra**: MongoDB, Redis, Kafka (KRaft mode), Kafka UI, all via Docker Compose

## The saga pattern

There is no distributed transaction anywhere in this system — no 2PC, no cross-service database transaction. MongoDB, Kafka, and Redis have no shared transaction boundary to begin with, so instead this runs a **choreography-based saga**: each service performs one local atomic step and publishes a fact about it (an event carrying a `sagaId`, which is just the order's id, surfacing at the top level of the event envelope — see `shared/kafka/eventEnvelope.js`). Nothing orchestrates the whole flow from one place; every step downstream reacts only to the facts it's told.

```
Order Service        Restaurant Service        Agent Service
     |                       |                        |
create order + outbox        |                        |
     |--- ORDER_CREATED ---->|                        |
     |                  accept/reject                 |
     |<-- RESTAURANT_ACCEPTED/REJECTED ----------------|
     |                       |--- (accepted) -------->|
     |                       |                  search + reserve agent
     |<---------------------------- AGENT_ASSIGNED / NO_AGENT_AVAILABLE
     |
  apply transition (state machine) + broadcast live status
```

**Failure = compensating transaction, not rollback.** If the restaurant rejects, or no agent is available, there's nothing to undo on the side that already succeeded — Order Service's consumer reacts to `RESTAURANT_REJECTED`/`NO_AGENT_AVAILABLE` by transitioning the order straight to `CANCELLED` (itself queuing an `ORDER_CANCELLED` outbox event so Notification Service tells the customer) instead of trying to claw back a step that was genuinely valid when it happened. See `services/order-service/src/stateMachine.js` and `transitionOrder.js` for exactly where this happens.

Every status change — from a Kafka event or a direct agent REST call — goes through one function, `applyTransition()`, which (a) checks the change is legal against the state machine and (b) writes it with a MongoDB `findOneAndUpdate` conditioned on the exact "from" status just read. That second part is what closes the classic cancel-vs-accept race: if a concurrent request already changed the order's status, the conditional write matches nothing and the caller gets a `409` instead of silently overwriting another decision.

## Reliability mechanisms

- **Outbox pattern** (Order Service): every event it needs to publish is written into the SAME atomic MongoDB document write as the state change that produced it (an `outbox` array field on the Order document). A background relay drains `PENDING` entries and publishes them to Kafka with retry + backoff, marking `FAILED` after 5 attempts for manual inspection. A Kafka outage at order-creation time delays downstream processing — it can never lose the event or leave the order without one.
- **Inbox pattern / idempotent consumers** (`shared/redis/idempotency.js`): every consumer checks `wasAlreadyProcessed` before acting and only calls `markProcessed` *after* its business logic succeeds — never before. A crash mid-processing means Kafka redelivers the message on restart, and it's safely retried rather than silently marked done and lost.
- **Dead-letter queues** (`shared/kafka/deadLetter.js`): a message that fails processing 3 times (with backoff) is published to `<topic>.dlq` with the failure reason, instead of being dropped.
- **Atomic agent reservation with a lease** (Agent Service): a Redis Lua script does the check-then-claim in one indivisible operation, so two orders can't grab the same agent. The claim carries a TTL (2 hours, renewed on every location ping from an actively-working agent) — if an agent's app genuinely crashes mid-delivery, the reservation self-expires instead of leaving them permanently stuck "busy."
- **Idempotency-Key on order creation**: `POST /api/orders` accepts an `idempotencyKey`; replaying the same key for the same user returns the original order instead of creating a duplicate (backed by a unique compound index, so it's race-safe, not just a first-request-wins check).

## Run everything with Docker (recommended)

```bash
cp .env.example .env
# edit .env and set JWT_SECRET / INTERNAL_SERVICE_SECRET — generate real
# values with: openssl rand -hex 32

docker compose up --build
```

First boot can take ~30-60s for Kafka to finish electing itself leader — the app services restart automatically until Kafka and Mongo are reachable.

Then seed some demo data (needs the same `INTERNAL_SERVICE_SECRET` you put in `.env`):

```bash
INTERNAL_SERVICE_SECRET=<the value from your .env> node scripts/seed-all.js
```

Open `http://localhost:5173`.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:8080 |
| Kafka UI (inspect topics/messages/DLQs) | http://localhost:8081 |

Only the gateway, the frontend, and Kafka UI publish a host port by default — the five backend services and the databases are reachable over the internal Docker network only (see the comment block above the `gateway:` entry in `docker-compose.yml` for why, and how to temporarily re-expose one for debugging).

## Run without Docker (local dev)

Each service has its own `.env` pointed at `localhost` ports. In separate terminals:
```bash
cd services/user-service && npm install && npm run dev
cd services/restaurant-service && npm install && npm run dev
cd services/order-service && npm install && npm run dev
cd services/agent-service && npm install && npm run dev
cd services/notification-service && npm install && npm run dev
cd gateway && npm install && npm run dev
cd frontend && npm install && npm run dev
```
You'll still need Mongo/Redis/Kafka reachable at `localhost` — easiest is `docker compose up mongodb redis kafka kafka-ui`.

## Seed accounts

Created by `scripts/seed-all.js`:
- customer: `customer@example.com` / `password123`
- restaurant: `restaurant@example.com` / `password123`
- agent: `agent@example.com` / `password123`

Restaurant/agent accounts can no longer be created through public signup — the script authenticates to the internal `register-staff` endpoint the same way a real onboarding tool would. The script also creates a restaurant ("Spice Route") with two menu items and puts the demo agent online near it, so you can log in as the customer and place an order immediately.

## Kafka topics

| Topic | Event | Producer | Consumers |
|---|---|---|---|
| `order-created` | `ORDER_CREATED` | order-service (via outbox) | restaurant-service, notification-service |
| `restaurant-accepted` | `RESTAURANT_ACCEPTED` | restaurant-service | agent-service, order-service, notification-service |
| `restaurant-rejected` | `RESTAURANT_REJECTED` | restaurant-service | order-service, notification-service |
| `agent-assigned` | `AGENT_ASSIGNED` | agent-service | order-service, notification-service |
| `no-agent-available` | `NO_AGENT_AVAILABLE` | agent-service | order-service, notification-service |
| `order-picked-up` | `ORDER_PICKED_UP` | order-service (via outbox) | notification-service |
| `out-for-delivery` | `OUT_FOR_DELIVERY` | order-service (via outbox) | notification-service |
| `order-delivered` | `ORDER_DELIVERED` | order-service (via outbox) | notification-service, agent-service (releases the agent) |
| `delivery-failed` | `DELIVERY_FAILED` | order-service (via outbox) | notification-service, agent-service (releases the agent) |
| `order-cancelled` | `ORDER_CANCELLED` | order-service (via outbox) | notification-service, agent-service (releases the agent) |

Every topic above also has a `<topic>.dlq` counterpart that a message lands in after 3 failed processing attempts.

Each consumer that needs to see every one of these events independently uses its own consumer group (`restaurant-service-group`, `agent-service-group`, `order-service-group`, `notification-service-group`).

## Main API routes

All routes are called through the gateway at `http://localhost:8080`. Two Redis-backed rate-limit tiers apply: 10 req/min/IP on `/api/users/login` and `/api/users/register`, 100 req/min/IP on everything else.

### Auth
- `POST /api/users/register` — creates a `customer` account only
- `POST /api/users/register-staff` — creates a `restaurant` or `agent` account; requires header `x-internal-secret: <INTERNAL_SERVICE_SECRET>`
- `POST /api/users/login`
- `GET /api/users/profile`

### Restaurants
- `GET /api/restaurants?page=&limit=`
- `GET /api/restaurants/search?q=&page=&limit=`
- `GET /api/restaurants/:id`
- `GET /api/restaurants/mine` *(restaurant role — your own restaurants)*
- `POST /api/restaurants` *(restaurant role — `location` is required)*
- `PATCH /api/restaurants/:id` *(restaurant role, owner only)*
- `DELETE /api/restaurants/:id` *(restaurant role, owner only)*
- `POST /api/restaurants/:restaurantId/menu` *(restaurant role, owner only)*
- `PATCH /api/restaurants/:restaurantId/menu/:itemId` *(restaurant role, owner only)*
- `DELETE /api/restaurants/:restaurantId/menu/:itemId` *(restaurant role, owner only)*

### Orders
- `POST /api/orders` *(customer — body: `{ restaurantId, items: [{menuItemId, quantity}], deliveryAddress, idempotencyKey? }`; price is always computed server-side)*
- `GET /api/orders/my-orders?page=&limit=` *(customer)*
- `GET /api/orders/restaurant/mine?page=&limit=` *(restaurant role — orders placed against your restaurants)*
- `GET /api/orders/agent/mine?page=&limit=` *(agent role — orders assigned to you)*
- `GET /api/orders/:id` *(owner-scoped: the customer who placed it, the restaurant it was placed against, or the agent assigned to it)*
- `PATCH /api/orders/:id/status` *(agent role, must be the assigned agent — body: `{ "status": "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED" }`)*
- `PATCH /api/orders/:id/cancel` *(customer, owner only — only while the order is still cancellable per the state machine)*

### Agents
- `PUT /api/agents/profile` *(agent — name/phone/vehicleType)*
- `GET /api/agents/profile/me` *(agent)*
- `PATCH /api/agents/status` *(agent — `{ "online": true }`)*
- `PATCH /api/agents/location` *(agent — `{ "longitude", "latitude", "orderId"? }`; rejects the update if you're not the agent actually reserved for that orderId)*
- `GET /api/agents/nearby` — internal only, requires `x-internal-secret`
- `POST /api/agents/assign` — internal only, requires `x-internal-secret` (manual override; the Kafka flow does this automatically)

## Security notes

- **Socket.IO requires a valid JWT on the handshake** (`io(url, { auth: { token } })`). Joining an order's tracking room re-checks that the same JWT is actually allowed to see that specific order (via the same ownership rule `GET /api/orders/:id` enforces) before the join succeeds.
- **No client-writable path into a tracking room.** Both live channels (agent location, order status) are fed only by trusted server-side Redis pub/sub publishes — there is no socket event a browser can emit that gets rebroadcast to other viewers.
- **`x-internal-secret`-gated endpoints** (`/api/agents/assign`, `/api/agents/nearby`, `/api/users/register-staff`) are for service-to-service/operator use, not end users — see `shared/auth/internalOnly.js`. This is a shared-secret header, a deliberately lightweight stand-in appropriate for one trusted Docker network; a real production deployment would use per-service credentials or a service mesh instead.
- **Secrets are not hardcoded.** `JWT_SECRET` and `INTERNAL_SERVICE_SECRET` come from a gitignored root `.env` via Docker Compose variable substitution — see `.env.example`.

## Testing

Three services have real, runnable test suites — not just static review. Each mocks only what genuinely can't run in a plain Node process (the database), and exercises everything else (bcrypt, JWT, Joi validation, the state machine, Redis) for real:

```bash
cd services/user-service && npm install && npm test    # 5 tests  — register/login, mocked DB
cd services/order-service && npm install && npm test   # 16 tests — state machine + pricing/ownership/BUG-007 regression, mocked DB
cd services/agent-service && npm install && npm test    # 5 tests  — nearest-agent reservation against a REAL Redis (needs one running on localhost:6379)
```

**What this caught, for real, before delivery**: while building these, a severe bug was found live rather than by re-reading code — `express.json()` was applied globally in the gateway *before* the proxy middleware, which silently drains the request body stream, so `http-proxy-middleware` forwards an EMPTY body to every downstream service. Reproduced with curl (`HTTP 000`, the request hangs until timeout, on every proxied POST/PATCH/PUT — register, login, place order, all of it), fixed by removing `express.json()` from the gateway (it never actually needed to read `req.body` itself — it's a proxy, not an API), and reverified the same request completes in ~20ms with the full JSON body reaching the target service.

Restaurant Service and Notification Service don't have test suites in this delivery — real MongoDB isn't reachable in the environment these were built in (confirmed by trying `mongodb-memory-server`, whose binary download is blocked by network policy), so a test suite for them would mean more of the same DB-mocking pattern already demonstrated in Order Service, not new verification approach. Gateway's proxying behavior was verified live with curl, above, rather than through a test file.


## Known limitations / good next increments

Being upfront about what's deliberately out of scope for a project this size, rather than silently glossing over it:

- **No timeout/escalation on a stuck pending order.** If Restaurant Service were genuinely unreachable for an extended period (not crashed-and-restarting, just down), an order could sit in `RESTAURANT_PENDING` indefinitely with nothing to auto-cancel it. A production version would add a scheduled sweep or a Kafka delayed-retry topic for this.
- **No automated test suite.** Everything in this delivery was verified by syntax-checking every file, resolving every import, and reasoning through the Kafka/Redis/Mongo semantics by hand — not by running it end-to-end or with unit/integration tests. Treat it as "very likely correct," run it once yourself before depending on it live, and layered tests (unit tests for `transitionOrder`/`stateMachine`, integration tests for the order-creation price/ownership validation, a couple of end-to-end saga tests) would be the natural next investment.
- **No multi-broker Kafka, no MongoDB replica set, no Redis Sentinel/Cluster.** This all runs as single instances, appropriate for local development and a portfolio demo — not for a real production deployment, which would need all three for actual high availability.
- **Restaurant accept/reject is automatic** (auto-accept unless closed/not found), not a real dashboard decision — restaurant/agent-facing UIs are still API-only, no frontend screens.
- **No payment service** — there's no `PAYMENT_FAILED` path because there's no payment step at all yet.
