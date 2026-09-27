import { createSlice } from "@reduxjs/toolkit";

// BUG-028: the cart used to persist under one shared "cart" key regardless
// of who was logged in — logging out and back in as a different account on
// the same browser would show the previous user's cart. Each user's cart
// now lives under its own key, and hydrateCartForUser (dispatched from
// AuthContext whenever the logged-in user changes) swaps to the right one.
const cartKey = (userId) => `cart:${userId}`;

const emptyCart = (ownerId) => ({ ownerId, restaurantId: null, items: [] });

const loadCartFor = (userId) => {
  if (!userId) return emptyCart(null);
  try {
    const raw = localStorage.getItem(cartKey(userId));
    return raw ? { ...JSON.parse(raw), ownerId: userId } : emptyCart(userId);
  } catch {
    return emptyCart(userId);
  }
};

const persist = (state) => {
  if (!state.ownerId) return; // logged-out cart is intentionally not persisted
  localStorage.setItem(cartKey(state.ownerId), JSON.stringify(state));
};

const cartSlice = createSlice({
  name: "cart",
  initialState: emptyCart(null),
  reducers: {
    hydrateCartForUser: (state, action) => {
      const loaded = loadCartFor(action.payload);
      state.ownerId = loaded.ownerId;
      state.restaurantId = loaded.restaurantId;
      state.items = loaded.items;
    },
    // BUG-029: switching restaurants used to silently wipe the cart inside
    // the reducer itself, with no chance for the UI to warn the user
    // first. The reducer no longer makes that call — RestaurantPage now
    // confirms with the user BEFORE dispatching addItem for a different
    // restaurant, and only ever calls startNewCartForRestaurant after
    // they've agreed.
    startNewCartForRestaurant: (state, action) => {
      state.restaurantId = action.payload;
      state.items = [];
      persist(state);
    },
    addItem: (state, action) => {
      const { restaurantId, item } = action.payload;

      if (!state.restaurantId) {
        state.restaurantId = restaurantId;
      }
      // If restaurantId differs here, the caller (RestaurantPage) was
      // supposed to have already confirmed and dispatched
      // startNewCartForRestaurant first — this reducer trusts that
      // happened rather than silently clearing again.

      const existing = state.items.find((i) => i.menuItemId === item.menuItemId);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.items.push({ ...item, quantity: 1 });
      }

      persist(state);
    },
    incrementItem: (state, action) => {
      const item = state.items.find((i) => i.menuItemId === action.payload);
      if (item) item.quantity += 1;
      persist(state);
    },
    decrementItem: (state, action) => {
      const item = state.items.find((i) => i.menuItemId === action.payload);
      if (item) {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          state.items = state.items.filter((i) => i.menuItemId !== action.payload);
        }
      }
      if (!state.items.length) state.restaurantId = null;
      persist(state);
    },
    clearCart: (state) => {
      state.restaurantId = null;
      state.items = [];
      persist(state);
    }
  }
});

export const {
  hydrateCartForUser,
  startNewCartForRestaurant,
  addItem,
  incrementItem,
  decrementItem,
  clearCart
} = cartSlice.actions;
export default cartSlice.reducer;
