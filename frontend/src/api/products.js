import { request } from './client';

const includePromotions = 'include_promotions=true';

export const fetchProducts = () => request(`/products?${includePromotions}`);
export const fetchProductById = (id) => request(`/products/${id}?${includePromotions}`);
