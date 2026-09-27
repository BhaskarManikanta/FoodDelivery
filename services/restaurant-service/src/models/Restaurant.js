import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: true
    },
    category: {
      type: String,
      default: 'General'
    },
    image: {
      type: String,
      default: ''
    },
    available: {
      type: Boolean,
      default: true
    }
  },
  { _id: true }
);

const restaurantSchema = new mongoose.Schema(
  {
    ownerId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    cuisine: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true
    },
    image: {
      type: String,
      default: ''
    },
    isOpen: {
      type: Boolean,
      default: true
    },
    // BUG-024: no default — a restaurant with no location set should be
    // visibly "not deliverable" rather than silently resolving to (0, 0),
    // which is a real point in the Gulf of Guinea and would make the
    // nearest-agent search run there.
    location: {
      lat: { type: Number },
      lng: { type: Number }
    },
    menu: [menuItemSchema]
  },
  { timestamps: true }
);

export default mongoose.model('Restaurant', restaurantSchema);