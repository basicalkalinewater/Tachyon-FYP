import React, { useEffect, useState } from "react";
import { fetchPolicies } from "../api/content";
import { sanitizeHtml } from "../utils/sanitizeHtml";

const ShippingReturns = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetchPolicies();
        const list = res.data || res || [];
        const matches = list.filter((item) => item.slug === "shipping-returns");
        if (mounted) setPolicies(matches);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load policy");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="container py-5">
      <h2 className="mb-4">Shipping & Returns</h2>
      {loading && <p className="text-muted">Loading policy...</p>}
      {error && !loading && <p className="text-muted">{error}</p>}
      {!loading && !error && policies.length === 0 && (
        <p className="text-muted">No policy published yet.</p>
      )}
      {!loading &&
        !error &&
        policies.map((item) => (
          <div className="mb-4" key={item.id}>
            <div
              className="text-muted"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content || "") }}
            />
          </div>
        ))}
    </div>
  );
};

export default ShippingReturns;
