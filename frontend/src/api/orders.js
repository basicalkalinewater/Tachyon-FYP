import { request } from "./client";

export const placeOrder = (payload) =>
  request("/orders", {
    method: "POST",
    body: payload,
  });
