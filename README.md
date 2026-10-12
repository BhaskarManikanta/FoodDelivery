# Food Delivery Microservices

An event-driven food ordering platform built with **React, Node.js, MongoDB, Redis, Kafka, Socket.IO and Docker Compose**. It is designed around failure handling, not just the happy path: a choreography-based saga with compensating actions, a transactional outbox for reliable Kafka publishing, idempotent consumers, dead-letter queues, and atomic delivery-agent reservation.

## Screenshots

| Login | Home |
|---|---|
| ![Login](screenshots/Login.png) | ![Home](screenshots/Home.png) |

| Restaurant Menu | Orders |
|---|---|
| ![Menu](screenshots/Menu.png) | ![Orders](screenshots/Orders.png) |

**Live Order Tracking**

![Live order tracking](screenshots/Tracking.png)


## Architecture

| Component | Responsibility |
|---|---|
| **Frontend** | React, Redux Toolkit (cart), React Router, Axios, Socket.IO client |
| **API Gateway** | Express proxy with JWT auth (including Socket.IO handshake auth), Redis-backed tiered rate limiting, and the single client-facing Socket.IO server for live tracking |
| **User Service** | Customer registration, login, JWT issuing, and an internal-secret-gated path for creating restaurant/agent accounts |
| **Restaurant Service** | Restaurant and menu CRUD, Redis-cached paginated reads, and a Kafka consumer that accepts or rejects new orders |
| **Order Service** | Owns the order lifecycle through an explicit state machine, computes prices server-side, and publishes events through a transactional outbox |
| **Agent Service** | Redis GEO for agent locations, atomic nearest-agent reservation (Lua script) with a self-expiring lease |
| **Notification Service** | Consumes lifecycle events and simulates email/push/SMS notifications, with duplicate-delivery protection |
| **Infrastructure** | MongoDB, Redis, Kafka (KRaft mode), Kafka UI, all via Docker Compose |

## Order Lifecycle (Saga)

There is no distributed transaction in this system: no two-phase commit and no cross-service database transaction. Each service performs one local atomic step and publishes an event describing it. Nothing orchestrates the whole flow from a single place; each service reacts only to the events it receives. Every event carries a `sagaId` (the order's id).

```
Order Service        Restaurant Service        Agent Service
     |                       |                        |
create order + outbox        |                        |
     |--- ORDER_CREATED ---->|                        |
     |                  accept / reject               |
     |<-- RESTAURANT_ACCEPTED / REJECTED -------------|
     |                       |--- (accepted) -------->|
     |                       |                search + reserve agent
     |<---------------------------- AGENT_ASSIGNED / NO_AGENT_AVAILABLE
     |
apply state transition + broadcast live status
```

**Failure is handled with compensating actions, not rollback.** If the restaurant rejects the order, or no agent is available, the Order Service moves the order to `CANCELLED` and queues an `ORDER_CANCELLED` event so the customer is notified and any reserved agent is released.

**Race-safe state changes.** Every status change, whether from a Kafka event or a REST call, goes through one function that validates the transition against the state machine and then writes it with a MongoDB `findOneAndUpdate` conditioned on the status that was just read. If a concurrent request changed the status first, the write matches nothing and the caller receives `409` instead of overwriting the other decision. This closes the classic cancel-vs-accept race.

## Reliability Mechanisms

- **Transactional outbox (Order Service).** Each event is written in the same atomic MongoDB update as the state change that produced it. A background relay publishes pending events to Kafka with retry and backoff, and marks an event `FAILED` after 5 attempts. A Kafka outage delays downstream processing but does not lose the event.
- **Idempotent consumers.** Each consumer checks whether a message was already processed, and marks it processed only *after* its business logic succeeds. If a consumer crashes mid-processing, Kafka redelivers the message and it is retried safely. The relay can publish a duplicate if it crashes after publishing but before marking an event sent, so consumers must tolerate duplicates.
- **Dead-letter queues.** After 3 failed attempts (with backoff), a message is published to `<topic>.dlq` along with the failure reason. DLQs preserve failed events for investigation; they do not reprocess automatically.
- **Atomic agent reservation with a lease.** A Redis Lua script checks availability and claims the agent in one indivisible operation, so two orders cannot reserve the same agent. The claim has a 2-hour TTL, renewed on each location update from an active agent, so a crashed agent app does not stay "busy" forever.
- **Order-creation idempotency.** `POST /api/orders` accepts an `idempotencyKey`. Replaying the same key for the same user returns the original order, enforced by a unique compound index.

## Getting Started

### Prerequisites

Docker and Docker Compose, Node.js and npm (for the seed script), and Git.

### 1. Clone

```bash
git clone https://github.com/BhaskarManikanta/FoodDelivery.git
cd FoodDelivery
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `JWT_SECRET` and `INTERNAL_SERVICE_SECRET`. Generate secure values with:

```bash
openssl rand -hex 32
```

Never commit real secrets.

### 3. Start everything

```bash
docker compose up --build
```

The first boot can take 30-60 seconds while Kafka elects a leader; the app services restart automatically until Kafka and MongoDB are reachable.

### 4. Seed demo data

```bash
INTERNAL_SERVICE_SECRET=<value from your .env> node scripts/seed-all.js
```

This creates the demo accounts below, a restaurant ("Spice Route") with two menu items, and an online delivery agent near it, so you can place an order immediately.

### 5. Open the app

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:8080 |
| Kafka UI (topics, messages, DLQs) | http://localhost:8081 |

Only these three publish host ports. The backend services and databases are reachable only on the internal Docker network.

### Demo accounts (local development only)

| Role | Email | Password |
|---|---|---|
| Customer | customer@example.com | password123 |
| Restaurant | restaurant@example.com | password123 |
| Delivery Agent | agent@example.com | password123 |

### Running without Docker

Start MongoDB, Redis and Kafka (for example `docker compose up mongodb redis kafka kafka-ui`), then run each service in its own terminal:

```bash
cd services/user-service && npm install && npm run dev
cd services/restaurant-service && npm install && npm run dev
cd services/order-service && npm install && npm run dev
cd services/agent-service && npm install && npm run dev
cd services/notification-service && npm install && npm run dev
cd gateway && npm install && npm run dev
cd frontend && npm install && npm run dev
```

## Kafka Topics

Every topic also has a `<topic>.dlq` counterpart. Each consuming service uses its own consumer group.

| Topic | Producer | Consumers |
|---|---|---|
| `order-created` | order-service (outbox) | restaurant, notification |
| `restaurant-accepted` | restaurant-service | agent, order, notification |
| `restaurant-rejected` | restaurant-service | order, notification |
| `agent-assigned` | agent-service | order, notification |
| `no-agent-available` | agent-service | order, notification |
| `order-picked-up` | order-service (outbox) | notification |
| `out-for-delivery` | order-service (outbox) | notification |
| `order-delivered` | order-service (outbox) | notification, agent (releases agent) |
| `delivery-failed` | order-service (outbox) | notification, agent (releases agent) |
| `order-cancelled` | order-service (outbox) | notification, agent (releases agent) |

## API Overview

All requests go through the gateway at `http://localhost:8080`. Rate limits (Redis-backed): 10 requests/min/IP on login and register, 100 requests/min/IP elsewhere.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/users/register` (customer only), `POST /api/users/register-staff` (internal secret), `POST /api/users/login`, `GET /api/users/profile` |
| **Restaurants** | `GET /api/restaurants`, `GET /api/restaurants/search?q=`, `GET /api/restaurants/:id`, `GET /api/restaurants/mine`, `POST/PATCH/DELETE /api/restaurants[/:id]`, menu CRUD under `/api/restaurants/:restaurantId/menu` (restaurant role, owner only) |
| **Orders** | `POST /api/orders`, `GET /api/orders/my-orders`, `GET /api/orders/restaurant/mine`, `GET /api/orders/agent/mine`, `GET /api/orders/:id` (owner-scoped), `PATCH /api/orders/:id/status` (assigned agent), `PATCH /api/orders/:id/cancel` (customer, while cancellable) |
| **Agents** | `PUT /api/agents/profile`, `GET /api/agents/profile/me`, `PATCH /api/agents/status`, `PATCH /api/agents/location` |

Order creation body: `{ restaurantId, items: [{ menuItemId, quantity }], deliveryAddress, idempotencyKey? }`. Prices are always computed on the server.

## Security

- JWT authentication with role-based access (customer, restaurant, agent).
- Socket.IO requires a valid JWT on the handshake, and joining an order's tracking room re-checks that the user may view that specific order.
- No client-writable path into tracking rooms: live updates come only from trusted server-side Redis pub/sub publishes.
- Internal endpoints (`register-staff`, agent assign/nearby) require an `x-internal-secret` header. This shared secret is a lightweight stand-in suited to one trusted Docker network; production would use per-service credentials or a service mesh.
- Prices are never taken from the client, and order status changes are restricted to the owner or assigned agent.
- Secrets come from a gitignored `.env`, not from source code.

## Testing

| Service | Tests | Notes |
|---|---|---|
| User Service | 5 | Register/login, database mocked |
| Order Service | 16 | State machine, pricing, ownership checks, database mocked |
| Agent Service | 5 | Nearest-agent reservation against a real Redis (must be running on `localhost:6379`) |

Run `npm install && npm test` inside each service's directory. Restaurant Service, Notification Service and the gateway have no automated tests yet; gateway proxying was verified manually. There are no end-to-end saga tests yet.

## Current Scope and Limitations

- **Restaurant decisions are automatic.** Orders are auto-accepted unless the restaurant is closed or not found. There is no restaurant-facing dashboard for manual accept/reject.
- **No timeout for stuck orders.** If the Restaurant Service were down for an extended period, an order could remain in `RESTAURANT_PENDING` with nothing to auto-cancel it. A scheduled sweep or delayed-retry topic would address this.
- **Notifications are simulated.** The Notification Service logs email/push/SMS messages; no real delivery channel is integrated.
- **No payments.** There is no payment step, so there is no payment-failure path in the saga.
- **Tracking is basic.** Live agent location and status updates work; route visualization and ETA do not.
- **Single-instance infrastructure.** Kafka, MongoDB and Redis each run as one instance, which suits local development and demos. Production would need a multi-broker Kafka cluster, a MongoDB replica set, and Redis Sentinel or Cluster.
- **Not exactly-once.** The outbox plus idempotent consumers give at-least-once delivery with duplicate protection, not exactly-once processing across the whole workflow.
- **No OpenAPI/Swagger docs** yet.

## Author

**Bhaskar Manikanta**: [GitHub](https://github.com/BhaskarManikanta)S