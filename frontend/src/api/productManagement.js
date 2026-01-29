import { request } from "./client";
import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api/products";

const buildQuery = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const listProducts = () => request("/products/?include_promotions=false");
export const getProduct = (id) => request(`/products/${id}?include_promotions=false`);

export const createProduct = async (formData) => {
  const response = await axios.post(API_BASE_URL, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const updateProduct = async (id, formData) => {
  const response = await axios.put(`${API_BASE_URL}/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const deleteProduct = (id) =>
  request(`/products/${id}`, { method: "DELETE" });

export const searchProductsByTitle = (title) => 
  request(`/products/title/${encodeURIComponent(title)}?include_promotions=false`);

export const filterProductsByCategory = (category) => 
  request(`/products/category/${encodeURIComponent(category)}?include_promotions=false`);

export const filterProductsByPrice = (min, max) => 
  request(`/products/price-range?${buildQuery({ min_price: min, max_price: max, include_promotions: false })}`);