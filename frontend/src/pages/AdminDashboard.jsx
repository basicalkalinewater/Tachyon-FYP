import React, { useEffect, useState, useCallback } from "react";
import { fetchCsatSummary, fetchCsatResponses } from "../api/support";
import { toast } from "react-hot-toast";
import "../styles/admin-dashboard.css";

const AdminDashboard = () => {
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summaryData = await fetchCsatSummary(30);
      const responses = await fetchCsatResponses(20);
      setCsat({
        summary: summaryData.summary || {},
        trend: summaryData.trend || [],
        verbatim: responses || [],
      });
    } catch (err) {
      toast.error(err.message || "Failed to load admin metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = csat.summary || {};

  return (
    <div className="admin-dashboard-page">
      <div className="admin-dashboard-grid">
        <div className="admin-card hero">
          <div>
            <p className="eyebrow">Admin Control</p>
            <h2>Support Quality Overview</h2>
            <p className="muted">CSAT across all agents and channels (last 30 days).</p>
          </div>
          <button className="pill-btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="admin-card metric">
          <p className="muted">CSAT %</p>
          <div className="metric-value">{Math.round(summary.csat_pct ?? 0)}%</div>
          <span className="muted small">rating ≥ 4</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Avg Rating</p>
          <div className="metric-value">{Number(summary.avg_rating ?? 0).toFixed(2)}</div>
          <span className="muted small">5-point scale</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Responses</p>
          <div className="metric-value">{summary.responses ?? 0}</div>
          <span className="muted small">last 30 days</span>
        </div>

        <div className="admin-card wide">
          <div className="card-header">
            <h4>Customer feedback</h4>
            <span className="muted small">Latest 20</span>
          </div>
          {loading ? (
            <p className="muted small mb-0">Loading...</p>
          ) : csat.verbatim && csat.verbatim.length ? (
            <ul className="feedback-list">
              {csat.verbatim.map((v) => (
                <li key={v.session_id}>
                  <div className="feedback-top">
                    <div className="badge">Rating {v.customer_rating}/5</div>
                    <span className="muted tiny">
                      {v.customer_rating_submitted_at
                        ? new Date(v.customer_rating_submitted_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  {v.customer_feedback && <div className="feedback-text">{v.customer_feedback}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small mb-0">No feedback yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
