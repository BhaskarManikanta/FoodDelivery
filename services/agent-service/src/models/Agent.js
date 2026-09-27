import mongoose from 'mongoose';

// Persisted agent profile. Live location and online/busy state stay in
// Redis (they change constantly and don't need durability) — this model
// only holds the slower-moving identity data that Redis shouldn't own.
const agentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    vehicleType: {
      type: String,
      enum: ['bike', 'scooter', 'bicycle', 'car'],
      default: 'bike'
    },
    rating: { type: Number, default: 5 }
  },
  { timestamps: true }
);

export default mongoose.model('Agent', agentSchema);
