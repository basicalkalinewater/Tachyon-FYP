import React, { useEffect, useState } from "react";
import { fetchFaqs } from "../api/content";

const Faq = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetchFaqs();
        const list = res.data || res || [];
        if (mounted) setItems(list);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load FAQs");
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
      <h2 className="mb-4">Frequently Asked Questions</h2>
      {loading && <p className="text-muted">Loading FAQs...</p>}
      {error && !loading && <p className="text-muted">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted">No FAQs yet.</p>
      )}
      {!loading &&
        !error &&
        items.map((item) => (
          <div className="mb-4" key={item.id}>
            <h5>{item.question}</h5>
            <p className="text-muted">{item.answer}</p>
          </div>
        ))}
    </div>
  );
};

export default Faq;
