import { request } from "./client";

export const listProductCategories = () => request("/product-categories");

export const createProductCategory = (body) =>
  request("/admin/product-categories", { method: "POST", body });

export const deleteProductCategory = (categoryId) =>
  request(`/admin/product-categories/${categoryId}`, { method: "DELETE" });
