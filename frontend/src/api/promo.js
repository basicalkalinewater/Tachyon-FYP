import { request } from "./client";

export const validatePromoCode = (body) =>
  request(`/promo-codes/validate`, { method: "POST", body });
