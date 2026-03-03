import { request } from './client';

const getCartToken = () => {
  try {
    return localStorage.getItem('cart_token') || '';
  } catch {
    return '';
  }
};

const withCartToken = (headers = {}) => {
  const token = getCartToken();
  return token ? { ...headers, 'X-Cart-Token': token } : headers;
};

export const createCart = () => request('/carts', { method: 'POST' });
export const fetchCart = (cartId) => request(`/carts/${cartId}`, { headers: withCartToken() });
export const addItemToCart = (cartId, payload) =>
  request(`/carts/${cartId}/items`, { method: 'POST', body: payload, headers: withCartToken() });
export const updateCartItem = (cartId, productId, payload) =>
  request(`/carts/${cartId}/items/${productId}`, { method: 'PATCH', body: payload, headers: withCartToken() });
export const removeCartItem = (cartId, productId) =>
  request(`/carts/${cartId}/items/${productId}`, { method: 'DELETE', headers: withCartToken() });
