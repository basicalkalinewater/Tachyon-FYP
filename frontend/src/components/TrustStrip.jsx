import React, { useEffect, useState } from "react";
import { fetchProducts } from "../api/products";
import "../styles/SocialProof.css";

const TrustStrip = () => {
  const [summary, setSummary] = useState({ avg: 0, count: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const products = await fetchProducts();
        const ratings = (products || [])
          .map((p) => ({ avg: Number(p.rating || 0), count: Number(p.ratingCount || 0) }))
          .filter((r) => r.count > 0);
        if (ratings.length === 0) return;
        const totalCount = ratings.reduce((sum, r) => sum + r.count, 0);
        const weightedSum = ratings.reduce((sum, r) => sum + r.avg * r.count, 0);
        const avg = totalCount ? weightedSum / totalCount : 0;
        setSummary({ avg, count: totalCount });
      } catch {
        setSummary({ avg: 0, count: 0 });
      }
    };
    load();
  }, []);

  return (
    <section className="trust-strip">
      <div className="container trust-strip-inner">
        <div className="trust-item">
          <span className="trust-value">
            {summary.count > 0 ? `${summary.avg.toFixed(1)}★` : "4.8★"}
          </span>
          <span className="trust-label">
            {summary.count > 0 ? `${summary.count} reviews` : "Average rating"}
          </span>
        </div>
        <div className="trust-item">
          <span className="trust-value">⚡ Fast shipping</span>
          <span className="trust-label">3–5 business days</span>
        </div>
        <div className="trust-item">
          <span className="trust-value">↩️ Free returns</span>
          <span className="trust-label">30‑day hassle‑free</span>
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
