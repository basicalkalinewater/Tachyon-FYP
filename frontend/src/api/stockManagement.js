import { request } from "./client";


// View all stock levels (includes product titles and low stock flags)
export const listStock = () => request("/admin/stocks/");

// Add a new stock entry for a product
// Body expected: { product_id, quantity_available, low_stock_threshold }
export const createStockEntry = (body) =>
  request("/admin/stocks/", { method: "POST", body });

// Update quantity or thresholds
// Using PATCH as defined in the backend for partial updates
export const updateStock = (productId, body) =>
  request(`/admin/stocks/${productId}`, { method: "PATCH", body });

// Remove a stock record
export const deleteStockRecord = (productId) =>
  request(`/admin/stocks/${productId}`, { method: "DELETE" });


// Helper to quickly restock (add to existing quantity)
// This still uses updateStock but keeps the UI logic clean
export const adjustStockQuantity = (productId, newQuantity) =>
  updateStock(productId, { quantity_available: newQuantity });

// Helper to update only the warning threshold
export const updateStockThreshold = (productId, threshold) =>
  updateStock(productId, { low_stock_threshold: threshold });

