import { request } from './client';

export const createCart = () => request('/carts', { method: 'POST' });
export const fetchCart = (cartId) => request(`/carts/${cartId}`);
export const addItemToCart = (cartId, payload) =>
  request(`/carts/${cartId}/items`, { method: 'POST', body: payload });
export const updateCartItem = (cartId, productId, payload) =>
  request(`/carts/${cartId}/items/${productId}`, { method: 'PATCH', body: payload });
export const removeCartItem = (cartId, productId) =>
  request(`/carts/${cartId}/items/${productId}`, { method: 'DELETE' });
