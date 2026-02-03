import { request } from "./client";

export const listProductReviews = (productId) =>
  request(`/products/${productId}/reviews`);

export const createProductReview = (productId, body) =>
  request(`/products/${productId}/reviews`, { method: "POST", body });

export const listFeaturedReviews = (limit = 6) =>
  request(`/reviews/featured?limit=${encodeURIComponent(limit)}`);

export const listMyReviews = (productId) =>
  request(`/reviews/mine${productId ? `?product_id=${encodeURIComponent(productId)}` : ""}`);

export const updateReview = (reviewId, body) =>
  request(`/reviews/${reviewId}`, { method: "PUT", body });

export const deleteReview = (reviewId) =>
  request(`/reviews/${reviewId}`, { method: "DELETE" });

export const checkReviewEligibility = (productId) =>
  request(`/reviews/eligibility?product_id=${encodeURIComponent(productId)}`);
