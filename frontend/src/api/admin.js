import { request } from "./client";

const toQuery = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const listAdminUsers = (params = {}) => {
  const qs = toQuery(params);
  return request(`/admin/users${qs ? `?${qs}` : ""}`);
};

export const createAdminUser = (body) =>
  request(`/admin/users`, {
    method: "POST",
    body,
  });

export const updateAdminUser = (userId, body) =>
  request(`/admin/users/${userId}`, {
    method: "PUT",
    body,
  });

export const disableAdminUser = (userId) =>
  request(`/admin/users/${userId}`, {
    method: "DELETE",
  });

export const fetchAdminInsights = () =>
  request(`/admin/insights`);

export const listFaqs = () => request(`/admin/faqs`);
export const createFaq = (body) => request(`/admin/faqs`, { method: "POST", body });
export const updateFaq = (id, body) => request(`/admin/faqs/${id}`, { method: "PUT", body });
export const deleteFaq = (id) => request(`/admin/faqs/${id}`, { method: "DELETE" });

export const listPolicies = () => request(`/admin/policies`);
export const createPolicy = (body) => request(`/admin/policies`, { method: "POST", body });
export const updatePolicy = (id, body) => request(`/admin/policies/${id}`, { method: "PUT", body });
export const deletePolicy = (id) => request(`/admin/policies/${id}`, { method: "DELETE" });

export const listPromoCodes = (params = {}) => {
  const qs = toQuery(params);
  return request(`/admin/promo-codes${qs ? `?${qs}` : ""}`);
};

export const createPromoCode = (body) => request(`/admin/promo-codes`, { method: "POST", body });
export const updatePromoCode = (id, body) => request(`/admin/promo-codes/${id}`, { method: "PUT", body });
export const deletePromoCode = (id) => request(`/admin/promo-codes/${id}`, { method: "DELETE" });
