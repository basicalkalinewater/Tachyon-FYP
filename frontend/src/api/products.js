import { request } from './client';

export const fetchProducts = () => request('/products');
export const fetchProductById = (id) => request(`/products/${id}`);
