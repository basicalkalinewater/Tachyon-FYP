import { createSlice } from '@reduxjs/toolkit';

// What your cart data will look like when the app starts
const initialState = {
  items: []   // each item: { id, title, price, image, qty }
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Add item or increase qty
    addItem(state, action) {
      const product = action.payload;
      const existing = state.items.find(item => item.id === product.id);

      if (existing) {
        existing.qty += 1;
      } else {
        state.items.push({ ...product, qty: 1 });
      }
    },

    // Decrease qty by 1, remove if qty hits 0
    decreaseItem(state, action) {
      const id = action.payload;
      const existing = state.items.find(item => item.id === id);
      if (!existing) return;

      if (existing.qty > 1) {
        existing.qty -= 1;
      } else {
        state.items = state.items.filter(item => item.id !== id);
      }
    },

    // Remove entire product from cart
    removeItem(state, action) {
      const id = action.payload;
      state.items = state.items.filter(item => item.id !== id);
    },

    // Clear all cart items
    clearCart(state) {
      state.items = [];
    }
  }
});

// Export actions for your components
export const { addItem, decreaseItem, removeItem, clearCart } = cartSlice.actions;

// Selectors for convenience
export const selectCartItems = state => state.cart.items;
export const selectCartCount = state =>
  state.cart.items.reduce((sum, item) => sum + item.qty, 0);
export const selectCartSubtotal = state =>
  state.cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);

// Export reducer to store.js
export default cartSlice.reducer;
