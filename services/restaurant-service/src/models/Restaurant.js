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
    },
    isVeg: {
      type: Boolean,
      default: false
    },
    rating: {
      type: Number,
      default: 4.5
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
    rating: {
      type: Number,
      default: 4.5
    },
    deliveryTime: {
      type: String,
      default: '30-40 mins'
    },
    costForTwo: {
      type: Number,
      default: 400
    },
    openingHours: {
      type: String,
      default: '09:00 AM - 11:00 PM'
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