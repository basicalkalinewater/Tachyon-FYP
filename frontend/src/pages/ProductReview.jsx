import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Skeleton from "react-loading-skeleton";

import { fetchProductById } from "../api/products";
import { createProductReview, updateReview, deleteReview, listMyReviews, checkReviewEligibility } from "../api/reviews";
import { formatCategoryLabel } from "../utils/category";

const ProductReview = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myReviews, setMyReviews] = useState([]);
  const [editingReview, setEditingReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", body: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewEligible, setReviewEligible] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchProductById(id);
        setProduct(data);
      } catch (err) {
        console.error("Failed to load product", err);
      }

      try {
        const mine = await listMyReviews(id);
        const list = mine?.data || mine || [];
        setMyReviews(list);
      } catch {
        setMyReviews([]);
      }

      try {
        const res = await checkReviewEligibility(id);
        const data = res?.data || res || {};
        setReviewEligible(!!data.eligible);
      } catch {
        setReviewEligible(false);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const submitReview = async (e) => {
    e.preventDefault();
    if (!reviewEligible && !editingReview) return;
    if (!reviewForm.rating || reviewForm.rating < 1 || reviewForm.rating > 5) return;
    setReviewSaving(true);
    try {
      if (editingReview?.id) {
        const res = await updateReview(editingReview.id, {
          rating: reviewForm.rating,
          title: reviewForm.title,
          body: reviewForm.body,
        });
        const updated = res?.data || res;
        if (updated) {
          setMyReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setEditingReview(null);
        }
      } else {
        const res = await createProductReview(id, {
          rating: reviewForm.rating,
          title: reviewForm.title,
          body: reviewForm.body,
        });
        const created = res?.data || res;
        if (created) {
          setMyReviews((prev) => [created, ...prev]);
        }
      }
      setReviewForm({ rating: 5, title: "", body: "" });
    } catch (err) {
      console.error("Review submit failed", err);
    } finally {
      setReviewSaving(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!editingReview?.id) return;
    if (!window.confirm("Delete your review?")) return;
    try {
      await deleteReview(editingReview.id);
      setMyReviews((prev) => prev.filter((r) => r.id !== editingReview.id));
      setEditingReview(null);
      setReviewForm({ rating: 5, title: "", body: "" });
    } catch (err) {
      console.error("Review delete failed", err);
    }
  };

  const beginEdit = (review) => {
    setEditingReview(review);
    setReviewForm({
      rating: review.rating || 5,
      title: review.title || "",
      body: review.body || "",
    });
  };

  const cancelEdit = () => {
    setEditingReview(null);
    setReviewForm({ rating: 5, title: "", body: "" });
  };

  if (loading) {
    return (
      <div className="container my-5 py-4">
        <Skeleton height={24} width={200} />
        <Skeleton height={40} width={360} className="mt-2" />
        <Skeleton height={280} className="mt-4" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container my-5 py-4">
        <h3 className="mb-2">Product not found</h3>
        <Link to="/products" className="btn btn-outline-saas">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="container my-5 py-4">
      <div className="d-flex flex-column flex-lg-row align-items-start justify-content-between gap-3 mb-4">
        <div>
          {product.category !== "uncategorized" && (
            <p className="text-uppercase text-primary fw-semibold small mb-1">
              {formatCategoryLabel(product.category)}
            </p>
          )}
          <h2 className="fw-bold mb-1">Review {product.title}</h2>
          <p className="text-muted mb-0">
            Share your experience to help other shoppers.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/dashboard/customer/orders" className="btn btn-outline-saas">
            Back
          </Link>
        </div>
      </div>

      <div className="card-saas p-4">
        {!reviewEligible && !editingReview && myReviews.length === 0 && (
          <p className="small text-muted mb-4">
            You can leave a review once your order is delivered.
          </p>
        )}
        {(reviewEligible || editingReview) && (
          <form onSubmit={submitReview}>
            <div className="row g-3">
              <div className="col-md-3">
                <label className="small text-muted">Rating</label>
                <select
                  className="form-select"
                  value={reviewForm.rating}
                  onChange={(e) =>
                    setReviewForm((p) => ({ ...p, rating: Number(e.target.value) }))
                  }
                >
                  {[5, 4, 3, 2, 1].map((r) => (
                    <option key={r} value={r}>
                      {r} stars
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-9">
                <label className="small text-muted">Title (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={reviewForm.title}
                  onChange={(e) =>
                    setReviewForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="Short summary"
                />
              </div>
              <div className="col-12">
                <label className="small text-muted">Review</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={reviewForm.body}
                  onChange={(e) =>
                    setReviewForm((p) => ({ ...p, body: e.target.value }))
                  }
                  placeholder="Share your experience"
                />
              </div>
            </div>
            <div className="d-flex gap-2 mt-4">
              <button className="btn btn-primary-saas" type="submit" disabled={reviewSaving}>
                {reviewSaving ? "Submitting..." : editingReview ? "Update review" : "Submit review"}
              </button>
              {editingReview && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={handleDeleteReview}
                  disabled={reviewSaving}
                >
                  Delete review
                </button>
              )}
              {editingReview && (
                <button type="button" className="btn btn-outline-saas" onClick={cancelEdit} disabled={reviewSaving}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        )}
        {myReviews.length > 0 && (
          <div className="mt-4">
            <h6 className="fw-semibold mb-3">Your reviews</h6>
            <div className="d-flex flex-column gap-3">
              {myReviews.map((review) => (
                <div key={review.id} className="border rounded-3 p-3 bg-white">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div>
                      <div className="fw-semibold">{review.title || "Verified Buyer"}</div>
                      <div className="small text-warning">
                        {review.rating} <i className="fa fa-star"></i>
                      </div>
                    </div>
                    <button className="btn btn-link p-0" type="button" onClick={() => beginEdit(review)}>
                      Edit
                    </button>
                  </div>
                  {review.body && <div className="small text-muted">{review.body}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductReview;
