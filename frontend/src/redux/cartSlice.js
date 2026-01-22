import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  createCart,
  fetchCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
} from '../api/cart';

const storageKey = 'cart_id';

const loadStoredCartId = () => {
  try {
    return localStorage.getItem(storageKey);
  } catch (err) {
    console.warn('Unable to read cart from storage', err);
    return null;
  }
};

const persistCartId = (id) => {
  try {
    localStorage.setItem(storageKey, id);
  } catch (err) {
    console.warn('Unable to persist cart id', err);
  }
};

const initialState = {
  cartId: loadStoredCartId(),
  items: [],
  status: 'idle',
  error: null,
};

const ensureCartId = async (getState) => {
  const existing = getState().cart.cartId || loadStoredCartId();
  if (existing) return existing;
  const { cartId } = await createCart();
  persistCartId(cartId);
  return cartId;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    qty: item.qty || item.quantity || 0,
  }));
};

export const bootstrapCart = createAsyncThunk('cart/bootstrap', async (_, { getState }) => {
  let cartId = await ensureCartId(getState);
  try {
    const data = await fetchCart(cartId);
    persistCartId(cartId);
    return { cartId, items: normalizeItems(data.items) };
  } catch (err) {
    // If stored cart is gone, start a fresh one
    if (err.message === 'Cart not found') {
      const created = await createCart();
      cartId = created.cartId;
      persistCartId(cartId);
      return { cartId, items: [] };
    }
    throw err;
  }
});

export const addItem = createAsyncThunk('cart/addItem', async (product, { getState }) => {
  let cartId = await ensureCartId(getState);
  const existing = getState().cart.items.find((item) => item.id === product.id);
  const nextQty = existing ? existing.qty + 1 : 1;
  try {
    await addItemToCart(cartId, { product_id: product.id, quantity: nextQty });
  } catch (err) {
    if (err.message === 'Cart not found') {
      const created = await createCart();
      cartId = created.cartId;
      await addItemToCart(cartId, { product_id: product.id, quantity: nextQty });
    } else {
      throw err;
    }
  }
  const data = await fetchCart(cartId);
  persistCartId(cartId);
  return { cartId, items: normalizeItems(data.items) };
});

export const decreaseItem = createAsyncThunk('cart/decreaseItem', async (productId, { getState }) => {
  const { cart } = getState();
  const cartId = await ensureCartId(getState);
  const existing = cart.items.find((item) => item.id === productId);

  if (!existing) return { cartId, items: cart.items };

  const nextQty = existing.qty - 1;
  if (nextQty <= 0) {
    await removeCartItem(cartId, productId);
  } else {
    await updateCartItem(cartId, productId, { quantity: nextQty });
  }

  const data = await fetchCart(cartId);
  return { cartId, items: normalizeItems(data.items) };
});

export const removeItem = createAsyncThunk('cart/removeItem', async (productId, { getState }) => {
  const cartId = await ensureCartId(getState);
  await removeCartItem(cartId, productId);
  const data = await fetchCart(cartId);
  return { cartId, items: normalizeItems(data.items) };
});

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    clearCart(state) {
      state.items = [];
      state.cartId = null;
      persistCartId('');
    },
  },
  extraReducers: (builder) => {
    const fulfilled = (state, action) => {
      state.status = 'succeeded';
      state.error = null;
      state.cartId = action.payload.cartId;
      state.items = action.payload.items;
    };

    const pending = (state) => {
      state.status = 'loading';
      state.error = null;
    };

    const rejected = (state, action) => {
      state.status = 'failed';
      state.error = action.error?.message || 'Request failed';
    };

    builder
      .addCase(bootstrapCart.pending, pending)
      .addCase(bootstrapCart.fulfilled, fulfilled)
      .addCase(bootstrapCart.rejected, rejected)
      .addCase(addItem.pending, pending)
      .addCase(addItem.fulfilled, fulfilled)
      .addCase(addItem.rejected, rejected)
      .addCase(decreaseItem.pending, pending)
      .addCase(decreaseItem.fulfilled, fulfilled)
      .addCase(decreaseItem.rejected, rejected)
      .addCase(removeItem.pending, pending)
      .addCase(removeItem.fulfilled, fulfilled)
      .addCase(removeItem.rejected, rejected);
  },
});

export const { clearCart } = cartSlice.actions;

export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.qty, 0);
export const selectCartSubtotal = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
export const selectCartStatus = (state) => state.cart.status;
export const selectCartError = (state) => state.cart.error;

export default cartSlice.reducer;
