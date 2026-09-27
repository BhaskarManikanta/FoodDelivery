import mongoose from 'mongoose';
import { ALL_STATES } from '../stateMachine.js';

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: String, required: true },
    name: { type: String, required: true },
    // Always resolved server-side from Restaurant Service at order-creation
    // time (see BUG-009) — never trust a price the client sends.
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

// The transactional outbox (BUG-010). An event lives here, atomically
// alongside the status change that produced it, until a background relay
// (see kafka.js's startOutboxRelay) successfully publishes it to Kafka and
// flips its status to PUBLISHED. This is how "the order was saved but the
// Kafka publish failed" becomes impossible: the two facts are recorded in
// one atomic document write, never two separate operations.
const outboxEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    topic: { type: String, required: true },
    eventType: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['PENDING', 'PUBLISHED', 'FAILED'], default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    publishedAt: { type: Date }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    // Captured from Restaurant Service at creation time so Order Service
    // can scope restaurant-role visibility (BUG-016) without having to
    // call another service on every read.
    restaurantOwnerId: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    deliveryAddress: { type: String, required: true },
    status: {
      type: String,
      enum: ALL_STATES,
      default: 'CREATED'
    },
    assignedAgentId: { type: String, default: null },
    lastFailureReason: { type: String, default: null },
    statusHistory: {
      type: [statusHistorySchema],
      default: () => [{ status: 'CREATED' }]
    },
    outbox: {
      type: [outboxEventSchema],
      default: []
    },
    // Supports Idempotency-Key on order creation (BUG-020): a compound
    // unique index scoped per-user means the SAME user retrying the SAME
    // key gets back the original order instead of creating a duplicate,
    // while two different users are free to reuse the same client-chosen
    // key value.
    idempotencyKey: { type: String, default: undefined }
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ restaurantOwnerId: 1, createdAt: -1 });
orderSchema.index({ assignedAgentId: 1, createdAt: -1 });
orderSchema.index({ 'outbox.status': 1 });

export default mongoose.model('Order', orderSchema);
