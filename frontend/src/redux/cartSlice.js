import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  createCart,
  fetchCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
} from '../api/cart';
import { validatePromoCode } from '../api/promo';

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
  promo: null,
  promoStatus: 'idle',
  promoError: null,
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

const computeSubtotal = (items = []) =>
  items.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 0), 0);

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
    await addItemToCart(cartId, { productId: product.id, quantity: nextQty });
  } catch (err) {
    if (err.message === 'Cart not found') {
      const created = await createCart();
      cartId = created.cartId;
      await addItemToCart(cartId, { productId: product.id, quantity: nextQty });
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

export const applyPromoCode = createAsyncThunk('cart/applyPromoCode', async (code, { getState }) => {
  const { cart } = getState();
  const subtotal = computeSubtotal(cart.items);
  const data = await validatePromoCode({ code, cartTotal: subtotal });
  return data.promo;
});

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    clearCart(state) {
      state.items = [];
      state.cartId = null;
      persistCartId('');
      state.promo = null;
      state.promoStatus = 'idle';
      state.promoError = null;
    },
    clearPromo(state) {
      state.promo = null;
      state.promoStatus = 'idle';
      state.promoError = null;
    },
  },
  extraReducers: (builder) => {
    const fulfilled = (state, action) => {
      state.status = 'succeeded';
      state.error = null;
      state.cartId = action.payload.cartId;
      state.items = action.payload.items;
      if (state.items.length === 0) {
        state.promo = null;
        state.promoStatus = 'idle';
        state.promoError = null;
      }
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
      .addCase(removeItem.rejected, rejected)
      .addCase(applyPromoCode.pending, (state) => {
        state.promoStatus = 'loading';
        state.promoError = null;
      })
      .addCase(applyPromoCode.fulfilled, (state, action) => {
        state.promoStatus = 'succeeded';
        state.promo = action.payload;
      })
      .addCase(applyPromoCode.rejected, (state, action) => {
        state.promoStatus = 'failed';
        state.promoError = action.error?.message || 'Unable to apply promo code';
      });
  },
});

export const { clearCart, clearPromo } = cartSlice.actions;

export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.qty, 0);
export const selectCartSubtotal = (state) =>
  computeSubtotal(state.cart.items);
export const selectCartStatus = (state) => state.cart.status;
export const selectCartError = (state) => state.cart.error;
export const selectAppliedPromo = (state) => state.cart.promo;
export const selectPromoStatus = (state) => state.cart.promoStatus;
export const selectPromoError = (state) => state.cart.promoError;
export const selectCartDiscount = (state) => {
  const promo = state.cart.promo;
  const subtotal = computeSubtotal(state.cart.items);
  if (!promo) return 0;
  if (promo.discountType === 'percent') {
    return Math.min(subtotal, +(subtotal * (promo.discountValue || 0) / 100).toFixed(2));
  }
  return Math.min(subtotal, +(promo.discountValue || 0));
};
export const selectCartTotalAfterDiscount = (state) =>
  Math.max(selectCartSubtotal(state) - selectCartDiscount(state), 0);

export default cartSlice.reducer;
