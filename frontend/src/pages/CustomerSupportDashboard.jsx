import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout, selectCurrentUser } from "../redux/authSlice";
import { logoutRequest } from "../api/auth";
import { toast } from "react-hot-toast";
import {
  fetchSupportSessions,
  fetchSessionDetail,
  claimSession,
  sendAgentMessage,
  resolveSession,
  fetchCsatSummary,
  fetchCsatResponses,
} from "../api/support";
import { SUPPORT_BASE_URL, getSessionToken } from "../api/client";

import "../styles/support-dashboard.css"; // dedicated styling for support dashboard

// Support dashboard sections
const SUPPORT_SECTIONS = [
  { id: "inbox", label: "Incoming Chats", group: "Chat Management" },
  { id: "assigned", label: "My Active Chats", group: "Chat Management" },
  { id: "history", label: "Chat History", group: "Chat Management" },
  { id: "csat", label: "CSAT", group: "Quality" },
  { id: "profile", label: "My Profile", group: "Account" },
];

// Group sections by their `group` name (NO hooks here)
const GROUPED_SUPPORT_SECTIONS = SUPPORT_SECTIONS.reduce((groups, section) => {
  const existing = groups.find((g) => g.group === section.group);
  if (existing) {
    existing.items.push(section);
  } else {
    groups.push({ group: section.group, items: [section] });
  }
  return groups;
}, []);

const CustomerSupportDashboard = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);

  const RESOLUTION_PRESETS = [
    "resolved",
    "info_provided",
    "refund_issued",
    "cancelled",
    "escalated",
  ];

  const [activeSection, setActiveSection] = useState("inbox");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [resolutionTag, setResolutionTag] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summaryEmailInfo, setSummaryEmailInfo] = useState({ sent: false, sentAt: null });
  const [eventSource, setEventSource] = useState(null);
  // CSAT
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [loadingCsat, setLoadingCsat] = useState(false);
  const hasSelection = Boolean(selectedSession);

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // ignore server logout errors; still clear client session
    } finally {
      dispatch(logout());
      toast.success("Logged out successfully");
    }
  };

  const agentId = user?.id;
  const displayEmail = user?.email || "";
  const displayName =
    (user?.fullName && user.fullName.trim()) || displayEmail || "Support Agent";

  const formatCustomerName = (session) =>
    session?.customer_full_name || session?.customer_email || "Customer";
  const formatAgentName = (session) =>
    session?.agent_full_name || session?.agent_email || "Support Agent";

  const sectionStatus = useMemo(() => {
    if (activeSection === "history") return "closed";
    if (activeSection === "assigned") return "in_progress";
    return "pending";
  }, [activeSection]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await fetchSupportSessions(sectionStatus);
      const filtered =
        activeSection === "assigned"
          ? data.filter((s) => s.agent_id === agentId)
          : data;
      setSessions(filtered);
      if (selectedSession && !filtered.find((s) => s.id === selectedSession.id)) {
        setSelectedSession(null);
        setMessages([]);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSection, agentId, sectionStatus, selectedSession]);

  const loadSessionDetail = async (sessionId, silent = false) => {
    if (!silent) setLoadingDetail(true);
    try {
      const data = await fetchSessionDetail(sessionId);
      setSelectedSession(data.session);
      setMessages(data.messages || []);
      setResolutionTag(data.session?.resolution_tag || "");
      setSummaryEmailInfo({
        sent: Boolean(data.session?.summary_email_sent),
        sentAt: data.session?.summary_email_sent_at || null,
      });
    } catch (err) {
      toast.error(err.message || "Failed to load session");
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);

  const loadCsat = useCallback(async () => {
    setLoadingCsat(true);
    try {
      const summaryData = await fetchCsatSummary(30);
      const responses = await fetchCsatResponses(20);
      setCsat({
        summary: summaryData.summary || {},
        trend: summaryData.trend || [],
        verbatim: responses || [],
      });
    } catch (err) {
      toast.error(err.message || "Failed to load CSAT");
    } finally {
      setLoadingCsat(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === "csat") {
      loadCsat();
    }
  }, [activeSection, loadCsat]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const claimed = sessions.filter((s) => s.status === "in_progress").length;
    const closed = sessions.filter((s) => s.status === "closed").length;
    const pending = sessions.filter((s) => s.status === "pending").length;
    return { total, claimed, closed, pending };
  }, [sessions]);

  const handleSelectSession = (sessionId) => {

    const token = getSessionToken();
      if (!token) {
        toast.error("Please log in to access session details.");
        return;
      }
    // close prior stream
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    loadSessionDetail(sessionId).then(() => {
      const token = getSessionToken();
      const streamUrl = token
        ? `${SUPPORT_BASE_URL}/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`
        : `${SUPPORT_BASE_URL}/sessions/${sessionId}/stream`;
      const es = new EventSource(streamUrl);
      es.onmessage = (ev) => {
        try {
          const newMessages = JSON.parse(ev.data);
          if (Array.isArray(newMessages) && newMessages.length > 0) {
            setMessages((prev) => {
              const lastId = prev.length ? prev[prev.length - 1].id : 0;
              const mapped = newMessages
                .filter((m) => !lastId || m.id > lastId)
                .map((m) => ({
                  id: m.id,
                  sender_role: m.sender_role,
                  sender_id: m.sender_id,
                  message: m.message,
                  is_bot: m.is_bot,
                  created_at: m.created_at,
                }));
              if (!mapped.length) return prev;
              return [...prev, ...mapped];
            });
          }
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        es.close();
        setEventSource(null);
      };
      setEventSource(es);
    });
  };

  const handleClaim = async (sessionId) => {
    try {
      await claimSession(sessionId, agentId);
      toast.success("Session claimed");
      setActiveSection("assigned");
      await loadSessions();
      await loadSessionDetail(sessionId);
    } catch (err) {
      toast.error(err.message || "Unable to claim session");
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSession || !messageText.trim()) return;
    const canSend =
      selectedSession.status !== "closed" &&
      selectedSession.agent_id &&
      selectedSession.agent_id === agentId;
    if (!canSend) {
      toast.error("Claim this session before replying.");
      return;
    }
    try {
      await sendAgentMessage(selectedSession.id, agentId, messageText.trim());
      setMessageText("");
    } catch (err) {
      toast.error(err.message || "Failed to send message");
    }
  };

  const handleResolve = async () => {
    if (!selectedSession) return;
    const canResolve =
      selectedSession.agent_id && selectedSession.agent_id === agentId;
    if (!canResolve) {
      toast.error("Only the assigned agent can close this chat.");
      return;
    }
    try {
      await resolveSession(selectedSession.id, agentId, resolutionTag.trim());
      toast.success("Session closed");
      setResolutionTag("");
      setActiveSection("history");
      await loadSessions();
      await loadSessionDetail(selectedSession.id);
    } catch (err) {
      toast.error(err.message || "Failed to resolve session");
    }
  };

  const renderSessionList = (emptyLabel) => (
    <div className="card-saas h-100 p-3 support-panel" aria-label="Chat queue">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Handover Queue</p>
          <h5 className="mb-0">Rasa escalations</h5>
        </div>
        <button className="btn btn-outline-saas btn-sm" onClick={loadSessions}>
          Refresh
        </button>
      </div>
      {loadingSessions ? (
        <p className="text-muted small mb-0">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted small mb-0">{emptyLabel}</p>
      ) : (
        <div className="support-list" role="list">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`support-list-item ${selectedSession?.id === session.id ? "active" : ""}`}
              onClick={() => handleSelectSession(session.id)}
              aria-pressed={selectedSession?.id === session.id}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <div>
                  <div className="fw-semibold">Chat #{session.id}</div>
                  <div className="text-muted small">
                    Customer: {formatCustomerName(session)}
                  </div>
                </div>
                <span className="badge bg-secondary text-uppercase">
                  {session.status}
                </span>
              </div>
              {(session.agent_full_name || session.agent_email) && (
                <div className="text-muted small">
                  Assigned to {formatAgentName(session)}
                </div>
              )}
              {sectionStatus === "pending" && session.queue_position && (
                <div className="text-muted small">
                  Queue position: #{session.queue_position}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderChatDetail = () => {
    if (!selectedSession) {
      return (
        <div className="card-saas h-100 d-flex align-items-center justify-content-center text-center support-chat-card">
          <div>
            <p className="text-muted mb-1">Select a session to view messages.</p>
            <p className="small text-muted mb-0">
              Sessions appear when Rasa escalates a conversation.
            </p>
          </div>
        </div>
      );
    }

    const isClaimedByMe =
      selectedSession.agent_id && selectedSession.agent_id === agentId;
    const canClaim = selectedSession.status === "pending";
    const summarySentLabel = summaryEmailInfo.sent
      ? `Summary emailed${summaryEmailInfo.sentAt ? ` at ${new Date(summaryEmailInfo.sentAt).toLocaleString()}` : ""}`
      : "Summary not sent";

    return (
      <div className="card-saas h-100 d-flex flex-column p-3 support-chat-card">
        <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
          <div>
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Session {selectedSession.id}
            </p>
            <h4 className="mb-1">
              {formatCustomerName(selectedSession)}
            </h4>
            <p className="text-muted small mb-0">
              Status: {selectedSession.status}
              {selectedSession.agent_id
                ? ` - Assigned to ${formatAgentName(selectedSession)}`
                : " - Unassigned"}
              {selectedSession.status === "pending" && selectedSession.queue_position
                ? ` - Queue #${selectedSession.queue_position}`
                : ""}
              {selectedSession.resolution_tag ? ` - Resolution: ${selectedSession.resolution_tag}` : ""}
            </p>
            {selectedSession.summary_email_sent !== undefined && (
              <p className="text-muted small mb-0">{summarySentLabel}</p>
            )}
          </div>
          {canClaim && (
            <button
              className="btn btn-primary mt-1 px-3"
              style={{ minWidth: "140px" }}
              onClick={() => handleClaim(selectedSession.id)}
            >
              Claim session
            </button>
          )}
        </div>

        <div className="flex-grow-1 p-3 mb-3 support-chat-body">
          {loadingDetail ? (
            <p className="text-muted small mb-0">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-muted small mb-0">No messages yet.</p>
          ) : (
            <ul className="list-unstyled mb-0 support-message-list">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`mb-3 support-message-row ${msg.sender_role === "agent" ? "text-end" : ""}`}
                >
                  <div
                    className={`d-inline-block p-2 rounded support-message ${
                      msg.sender_role === "agent"
                        ? "support-message-agent"
                        : "support-message-customer"
                    }`}
                  >
                    <div className="small fw-semibold mb-1">
                      {msg.sender_role === "agent"
                        ? formatAgentName(selectedSession)
                        : formatCustomerName(selectedSession)}
                    </div>
                    <div>{msg.message}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="d-flex flex-column gap-2">
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control"
              placeholder="Type a reply"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={!isClaimedByMe || selectedSession.status === "closed"}
            />
            <button
              className="btn btn-primary"
              onClick={handleSendMessage}
              disabled={
                !messageText.trim() ||
                !isClaimedByMe ||
                selectedSession.status === "closed"
              }
            >
              Send
            </button>
          </div>
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control"
              placeholder="Resolution note (optional)"
              value={resolutionTag}
              onChange={(e) => setResolutionTag(e.target.value)}
              disabled={selectedSession.status === "closed" || !isClaimedByMe}
            />
            <select
              className="form-select"
              value={resolutionTag}
              onChange={(e) => setResolutionTag(e.target.value)}
              disabled={selectedSession.status === "closed" || !isClaimedByMe}
            >
              <option value="">Select resolution</option>
              {RESOLUTION_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button
              className="btn btn-outline-saas"
              onClick={handleResolve}
              disabled={selectedSession.status === "closed" || !isClaimedByMe}
            >
              Close chat
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <section className="dashboard-section card-saas">
      <p className="text-muted text-uppercase small fw-semibold mb-1">
        Chat History
      </p>
      <h3 className="mb-3">Closed Sessions</h3>
      {loadingSessions ? (
        <p className="text-muted small mb-0">Loading history...</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted small mb-0">No closed sessions yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Resolution</th>
                <th>Summary Email</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>#{s.id}</td>
                  <td>{formatCustomerName(s)}</td>
                  <td>{formatAgentName(s)}</td>
                  <td className="text-capitalize">{s.status}</td>
                  <td>{s.resolution_tag || "N/A"}</td>
                  <td>
                    {s.summary_email_sent
                      ? s.summary_email_sent_at
                        ? new Date(s.summary_email_sent_at).toLocaleString()
                        : "Sent"
                      : "Not sent"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderCsat = () => {
    const summary = csat.summary || {};
    const csatPct = summary.csat_pct ?? 0;
    const avgRating = summary.avg_rating ?? 0;
    const responses = summary.responses ?? 0;

    return (
      <section className="dashboard-section card-saas">
        <p className="text-muted text-uppercase small fw-semibold mb-1">Customer Satisfaction</p>
        <h3 className="mb-3">Post-chat CSAT</h3>

        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">CSAT %</p>
            <h4 className="stat-value">{Math.round(csatPct)}%</h4>
            <span className="stat-help">rating ≥ 4 / total</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Avg Rating</p>
            <h4 className="stat-value">{Number(avgRating).toFixed(2)}</h4>
            <span className="stat-help">5-point scale</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Responses</p>
            <h4 className="stat-value">{responses}</h4>
            <span className="stat-help">last 30 days</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Recent feedback</h5>
            <button className="btn btn-outline-saas btn-sm" onClick={loadCsat} disabled={loadingCsat}>
              {loadingCsat ? "Loading..." : "Refresh"}
            </button>
          </div>
          {loadingCsat ? (
            <p className="text-muted small mb-0">Loading CSAT...</p>
          ) : csat.verbatim && csat.verbatim.length > 0 ? (
            <ul className="list-unstyled mb-0">
              {csat.verbatim.map((v) => (
                <li key={v.session_id} className="mb-3 p-3 border rounded">
                  <div className="d-flex justify-content-between">
                    <strong>Rating {v.customer_rating}/5</strong>
                    <span className="text-muted small">
                      {v.customer_rating_submitted_at
                        ? new Date(v.customer_rating_submitted_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  {v.customer_feedback && <div>{v.customer_feedback}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted small mb-0">No feedback yet.</p>
          )}
        </div>
      </section>
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case "inbox":
        return (
          <section className="dashboard-section support-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">Incoming Chats</p>
                <h3>Escalated Chats Queue</h3>
              </div>
            </div>
            <div className={`support-grid ${hasSelection ? "with-chat" : "single-column"}`}>
              <div className="support-column queue-column">
                {renderSessionList("No pending escalations right now.")}
              </div>
              {hasSelection && (
                <div className="support-column chat-column">{renderChatDetail()}</div>
              )}
            </div>
          </section>
        );
      case "assigned":
        return (
          <section className="dashboard-section support-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">My Active Chats</p>
                <h3>Chats Assigned To You</h3>
              </div>
            </div>
            <div className={`support-grid ${hasSelection ? "with-chat" : "single-column"}`}>
              <div className="support-column queue-column">
                {renderSessionList("No active chats assigned to you.")}
              </div>
              {hasSelection && (
                <div className="support-column chat-column">{renderChatDetail()}</div>
              )}
            </div>
          </section>
        );
      case "history":
        return renderHistory();
      case "csat":
        return renderCsat();
      case "profile":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              My Profile
            </p>
            <h3 className="mb-3">Support Agent Details</h3>
            <p className="text-muted">This is a read-only section for now.</p>
            <p>
              <strong>Name:</strong> {displayName}
            </p>
            <p>
              <strong>Email:</strong> {displayEmail}
            </p>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container py-5 dashboard-container">
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="dashboard-sidebar card-saas">
          <div className="mb-4">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Support Agent
            </p>
            <h4 className="mb-0">{displayName}</h4>
            <p className="text-muted mb-0">{displayEmail}</p>
          </div>

          {GROUPED_SUPPORT_SECTIONS.map(({ group, items }) => (
            <div className="sidebar-group" key={group}>
              <p className="text-muted text-uppercase small fw-semibold mb-2">
                {group}
              </p>
              <nav className="dashboard-nav">
                {items.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`sidebar-link ${
                      activeSection === section.id ? "active" : ""
                    }`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
          ))}

          <button
            className="btn btn-outline-saas mt-4 w-100"
            onClick={handleLogout}
          >
            Log out
          </button>
        </aside>

        {/* Main content */}
        <main className="dashboard-content">
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Support Control Center</p>
              <h2 className="mb-1">Customer Support Dashboard</h2>
              <p className="text-muted mb-0">
                Monitor escalations, claim chats, and keep customers informed in real-time.
              </p>
            </div>
            <div className="hero-actions">
              <button className="btn btn-outline-saas" onClick={loadSessions}>
                Refresh data
              </button>
            </div>
          </section>

          <section className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Open</p>
              <h4 className="stat-value">{stats.pending}</h4>
              <span className="stat-help">Pending escalations</span>
            </div>
            <div className="stat-card">
              <p className="stat-label">In Progress</p>
              <h4 className="stat-value">{stats.claimed}</h4>
              <span className="stat-help">Chats you’re handling</span>
            </div>
            <div className="stat-card">
              <p className="stat-label">Closed</p>
              <h4 className="stat-value">{stats.closed}</h4>
              <span className="stat-help">Resolved sessions</span>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total in view</p>
              <h4 className="stat-value">{stats.total}</h4>
              <span className="stat-help">Filtered by tab</span>
            </div>
          </section>

          {renderSection()}
        </main>
      </div>
    </div>
  );
};

export default CustomerSupportDashboard;
