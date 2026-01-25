import { request } from "./client";

const buildQuery = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const listProducts = () => request("/products/?include_promotions=false");
export const getProduct = (id) => request(`/products/${id}?include_promotions=false`);

export const createProduct = (body) =>
  request("/products/", { method: "POST", body });

export const updateProduct = (id, body) =>
  request(`/products/${id}`, { method: "PUT", body });

export const deleteProduct = (id) =>
  request(`/products/${id}`, { method: "DELETE" });

// --- SEARCH & FILTER EXTENSIONS ---

export const searchProductsByTitle = (title) => 
  request(`/products/title/${encodeURIComponent(title)}?include_promotions=false`);

export const filterProductsByCategory = (category) => 
  request(`/products/category/${encodeURIComponent(category)}?include_promotions=false`);

export const filterProductsByPrice = (min, max) => 
  request(`/products/price-range?${buildQuery({ min_price: min, max_price: max, include_promotions: false })}`);
