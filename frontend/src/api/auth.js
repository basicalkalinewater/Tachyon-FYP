import { request } from "./client";

export const loginRequest = (email, password) =>
  request("/auth/login", {
    method: "POST",
    body: { email, password },
  });

export const registerRequest = (fullName, email, password) =>
  request("/auth/register", {
    method: "POST",
    body: { fullName, email, password },
  });

export const fetchCustomerDashboard = (userId, section) =>
  request(
    `/dashboard/customer/${userId}${section ? `?section=${encodeURIComponent(section)}` : ""}`
  );

export const updateCustomerProfile = (userId, body) =>
  request(`/customer/profile/${userId}`, {
    method: "PUT",
    body,
  });

export const createAddress = (userId, body) =>
  request(`/customer/addresses/${userId}`, {
    method: "POST",
    body,
  });

export const updateAddress = (userId, addressId, body) =>
  request(`/customer/addresses/${userId}/${addressId}`, {
    method: "PUT",
    body,
  });

export const deleteAddress = (userId, addressId) =>
  request(`/customer/addresses/${userId}/${addressId}`, {
    method: "DELETE",
  });

export const createPaymentMethod = (userId, body) =>
  request(`/customer/payments/${userId}`, {
    method: "POST",
    body,
  });

export const updatePaymentMethod = (userId, paymentId, body) =>
  request(`/customer/payments/${userId}/${paymentId}`, {
    method: "PUT",
    body,
  });

export const deletePaymentMethod = (userId, paymentId) =>
  request(`/customer/payments/${userId}/${paymentId}`, {
    method: "DELETE",
  });

export const changePassword = (userId, body) =>
  request(`/customer/password/${userId}`, {
    method: "PUT",
    body,
  });

export const logoutRequest = () =>
  request("/auth/logout", {
    method: "POST",
  });

export const fetchAdminProfile = () => request("/auth/profile/admin");

export const updateAdminProfile = (body) =>
  request("/auth/profile/admin", {
    method: "PUT",
    body,
  });
