import React, { useEffect, useState } from "react";
import { listFeaturedReviews } from "../api/reviews";
import "../styles/SocialProof.css";

const SocialProof = () => {
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const pageSize = 3;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await listFeaturedReviews(6);
        const list = res?.data || res || [];
        setReviews(list);
      } catch {
        setReviews([]);
      }
    };
    load();
  }, []);

  const totalPages = Math.max(Math.ceil(reviews.length / pageSize), 1);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const visible = reviews.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <section className="social-proof">
      <div className="container">
        <div className="social-proof-header">
          <div className="social-proof-title">
            <h2 className="fw-bold mb-1">Customer Reviews</h2>
          </div>
          {reviews.length >= 1 && (
            <div className="social-proof-controls">
              <button
                type="button"
                className="btn btn-outline-saas btn-sm"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={!canPrev}
                aria-label="Newer reviews"
              >
                &lt;
              </button>
              <button
                type="button"
                className="btn btn-outline-saas btn-sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                disabled={!canNext}
                aria-label="Older reviews"
              >
                &gt;
              </button>
            </div>
          )}
        </div>
        {reviews.length === 0 ? (
          <div className="social-proof-empty">
            Add featured reviews to showcase social proof here.
          </div>
        ) : (
          <div className="social-proof-grid">
            {visible.map((review) => (
              <div key={review.id} className="social-proof-card">
                <div className="social-proof-rating">
                  {review.rating} <i className="fa fa-star" aria-hidden="true" />
                </div>
                <div className="social-proof-quote">“{review.body || review.title}”</div>
                <div className="social-proof-meta">
                  <span className="fw-semibold">Verified Buyer</span>
                  <span className="text-muted">
                    {review.product?.title ? ` • ${review.product.title}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default SocialProof;
