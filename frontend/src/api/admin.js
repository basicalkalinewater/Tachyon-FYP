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
