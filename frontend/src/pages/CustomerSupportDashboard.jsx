import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  fetchAgentProfile,
  updateAgentProfile,
} from "../api/support";
import { SUPPORT_BASE_URL, getSessionToken } from "../api/client";

import "../styles/support-dashboard.css"; // dedicated styling for support dashboard

// Support dashboard sections
const SUPPORT_SECTIONS = [
  { id: "overview", label: "Overview", group: "Ticket Management" },
  { id: "inbox", label: "Open Tickets", group: "Ticket Management" },
  { id: "assigned", label: "My Tickets", group: "Ticket Management" },
  { id: "history", label: "Closed Tickets", group: "Ticket Management" },
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

  const RESOLUTION_PRESETS = ["Resolved", "Refund Issued", "Other"];

  const formatPresetLabel = (preset) => preset;

  const { section } = useParams();
  const sectionIds = useMemo(() => new Set(SUPPORT_SECTIONS.map((item) => item.id)), []);
  const defaultSection = "overview";
  const [activeSection, setActiveSection] = useState(
    section && sectionIds.has(section) ? section : defaultSection
  );
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [resolutionTag, setResolutionTag] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const wsRef = useRef(null);
  const connectRef = useRef(null);
  const reconnectRef = useRef({ attempt: 0, timer: null, sessionId: null });
  const selectedSessionIdRef = useRef(null);
  // CSAT
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [loadingCsat, setLoadingCsat] = useState(false);
  const [stats, setStats] = useState({ pending: 0, claimed: 0, closed: 0, total: 0 });
  const hasSelection = Boolean(selectedSession);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const STATUS_LABEL = {
    pending: "Open",
    in_progress: "In Progress",
    closed: "Resolved",
  };

  const scheduleReconnect = useCallback(() => {
    const state = reconnectRef.current;
    if (!state.sessionId) return;
    const attempt = Math.min(state.attempt + 1, 6);
    state.attempt = attempt;
    const base = Math.min(10000, 500 * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * 250);
    const delay = base + jitter;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      if (connectRef.current) {
        connectRef.current(state.sessionId);
      }
    }, delay);
  }, []);

  const connectWebSocket = useCallback((sessionId) => {
    const token = getSessionToken();
    if (!token) return;
    const wsBase = SUPPORT_BASE_URL.replace(/^http/, "ws");
    const streamUrl = `${wsBase}/sessions/${sessionId}/ws`;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(streamUrl);
    ws.onopen = () => {
      reconnectRef.current.attempt = 0;
      ws.send(JSON.stringify({ type: "auth", token }));
      console.log("[ws] open", streamUrl);
    };
    ws.onmessage = (ev) => {
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
    ws.onerror = () => {
      console.log("[ws] error", streamUrl);
      ws.close();
    };
    ws.onclose = () => {
      console.log("[ws] close", streamUrl, ws.readyState);
      if (reconnectRef.current.sessionId) {
        scheduleReconnect();
      }
    };
    wsRef.current = ws;
  }, [scheduleReconnect]);
  connectRef.current = connectWebSocket;

  useEffect(() => {
    return () => {
      const state = reconnectRef.current;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.sessionId = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // ignore server logout errors; still clear client session
    } finally {
      dispatch(logout());
      toast.success("Successfully logged out");
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
    return ""; // inbox pulls both pending + in_progress by default
  }, [activeSection]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // fetch open (pending + in_progress)
      const openData = await fetchSupportSessions("");
      // fetch closed for history/stats
      const closedData = await fetchSupportSessions("closed");
      const merged = [...openData, ...closedData];

      let filtered = merged;
      if (activeSection === "assigned") {
        filtered = merged.filter((s) => s.status === "in_progress" && s.agent_id === agentId);
      } else if (activeSection === "history") {
        filtered = merged.filter((s) => s.status === "closed");
      } else {
        filtered = merged.filter((s) => s.status === "pending" || s.status === "in_progress");
      }

      setSessions(filtered);
      const activeId = selectedSessionIdRef.current;
      if (activeId && !filtered.find((s) => s.id === activeId)) {
        setSelectedSession(null);
        setSelectedSessionId(null);
        selectedSessionIdRef.current = null;
        setMessages([]);
      }

      // Update stat counts from merged set
      const pending = merged.filter((s) => s.status === "pending").length;
      const claimed = merged.filter((s) => s.status === "in_progress").length;
      const closed = merged.filter((s) => s.status === "closed").length;
      setStats({ pending, claimed, closed, total: pending + claimed + closed });
    } catch (err) {
      toast.error(err.message || "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSection, agentId]);

  const loadSessionDetail = async (sessionId, silent = false) => {
    if (!silent) setLoadingDetail(true);
    try {
      const data = await fetchSessionDetail(sessionId);
      setSelectedSession(data.session);
      setSelectedSessionId(data.session?.id || sessionId);
      selectedSessionIdRef.current = data.session?.id || sessionId;
      setMessages(data.messages || []);
      setResolutionTag(data.session?.resolution_tag || "");
    } catch (err) {
      toast.error(err.message || "Failed to load session");
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  };

  const pollSessionMessages = useCallback(async (sessionId) => {
    // lightweight poll without toasts/loaders; ignore errors
    try {
      const data = await fetchSessionDetail(sessionId);
      setSelectedSession(data.session);
      const incoming = data.messages || [];
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id).filter(Boolean));
        const append = incoming.filter((m) => m.id && !existingIds.has(m.id));
        if (!append.length) return prev;
        return [...prev, ...append];
      });
    } catch (_) {
      // ignore polling errors to keep loop alive
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [activeSection, loadSessions]);

  useEffect(() => {
    if (!section) {
      if (activeSection !== defaultSection) {
        setActiveSection(defaultSection);
      }
      return;
    }
    if (!sectionIds.has(section)) return;
    if (section !== activeSection) {
      setActiveSection(section);
    }
  }, [section, sectionIds, activeSection]);

  // Periodic refresh for session list (keeps counts fresh without thrashing UI)
  useEffect(() => {
    const interval = setInterval(() => loadSessions(), 20000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // Fallback poll so agent feed stays fresh even if WebSocket drops
  useEffect(() => {
    if (!selectedSession?.id) return undefined;
    const sessionId = selectedSession.id;
    // Only enable fallback polling if WS is not connected.
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        pollSessionMessages(sessionId);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedSession?.id, pollSessionMessages]);

  const loadCsat = useCallback(async () => {
    setLoadingCsat(true);
    try {
      const summaryData = await fetchCsatSummary(120);
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

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchAgentProfile();
      setProfileForm({
        full_name: data.full_name || "",
        phone: data.phone || "",
      });
    } catch (err) {
      toast.error(err.message || "Failed to load profile");
    }
  }, []);

  useEffect(() => {
    if (activeSection === "profile") {
      loadProfile();
    }
  }, [activeSection, loadProfile]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateAgentProfile({
        full_name: profileForm.full_name,
        phone: profileForm.phone,
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSelectSession = (sessionId) => {

    const token = getSessionToken();
      if (!token) {
        toast.error("Please login to access session details.");
        return;
      }
    setSelectedSessionId(sessionId);
    selectedSessionIdRef.current = sessionId;
    // close prior stream
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectRef.current.timer) {
      clearTimeout(reconnectRef.current.timer);
      reconnectRef.current.timer = null;
    }
    loadSessionDetail(sessionId).then(() => {
      reconnectRef.current.sessionId = sessionId;
      connectWebSocket(sessionId);
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
          <p className="eyebrow">Ticket Queue</p>
              <h5 className="mb-0">Escalations</h5>
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
                  <div className="fw-semibold">
                    {session.ticket_number || `Chat #${session.id}`}
                  </div>
                  <div className="text-muted small">
                    {session.subject || "Conversation"}
                  </div>
                  <div className="text-muted small">
                    Customer: {formatCustomerName(session)}
                  </div>
                </div>
                <span className="badge bg-secondary text-uppercase">
                  {STATUS_LABEL[session.status] || session.status}
                </span>
              </div>
              {(session.agent_full_name || session.agent_email) && (
                <div className="text-muted small">
                  Assigned to {formatAgentName(session)}
                </div>
              )}
              <div className="d-flex align-items-center gap-2 mt-2">
                {session.priority && (
                  <div className="text-muted small">
                    Priority: {session.priority.charAt(0).toUpperCase() + session.priority.slice(1)}
                  </div>
                )}
                {/* <span className="ms-auto support-pill">
                  {(STATUS_LABEL[session.status] || session.status || "").toUpperCase()}
                </span> */}
              </div>
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
    return (
      <div className="card-saas h-100 d-flex flex-column p-3 support-chat-card">
        <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
          <div>
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Ticket {selectedSession.ticket_number || selectedSession.id}
            </p>
            <h4 className="mb-1">
              {selectedSession.subject || "Support conversation"}
            </h4>
            <p className="text-muted small mb-0">
              Status: {STATUS_LABEL[selectedSession.status] || selectedSession.status}
              {selectedSession.priority ? ` · Priority ${selectedSession.priority}` : ""}
              {selectedSession.agent_id
                ? ` · Assigned to ${formatAgentName(selectedSession)}`
                : " · Unassigned"}
              {selectedSession.status === "pending" && selectedSession.queue_position
                ? ` · Queue #${selectedSession.queue_position}`
                : ""}
              {selectedSession.resolution_tag ? ` · Resolution: ${selectedSession.resolution_tag}` : ""}
            </p>
            <p className="text-muted small mb-0">
              Requestor: {formatCustomerName(selectedSession)} ({selectedSession.customer_email || "N/A"})
            </p>
          </div>
          {canClaim && (
            <button
              className="btn btn-primary mt-1 px-3"
              style={{ minWidth: "140px" }}
              onClick={() => handleClaim(selectedSession.id)}
            >
              Claim ticket
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
                  {formatPresetLabel(preset)}
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
        Closed Tickets
      </p>
      <h3 className="mb-3">Closed Tickets</h3>
      {loadingSessions ? (
        <p className="text-muted small mb-0">Loading history...</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted small mb-0">No closed sessions yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Customer</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.ticket_number || `#${s.id}`}</td>
                  <td>{s.subject || "Conversation"}</td>
                  <td className="text-capitalize">{s.priority || "medium"}</td>
                  <td>{formatCustomerName(s)}</td>
                  <td>{formatAgentName(s)}</td>
                  <td className="text-capitalize">{STATUS_LABEL[s.status] || s.status}</td>
                  <td>{s.resolution_tag || "N/A"}</td>
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
      case "overview":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">Overview</p>
            <h3 className="mb-3">Support overview</h3>
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
                <p className="stat-label">Closed Tickets</p>
                <h4 className="stat-value">{stats.closed}</h4>
                <span className="stat-help">Resolved tickets</span>
              </div>
              <div className="stat-card">
                <p className="stat-label">Total in view</p>
                <h4 className="stat-value">{stats.total}</h4>
                <span className="stat-help">Filtered by tab</span>
              </div>
            </section>
          </section>
        );
      case "inbox":
        return (
          <section className="dashboard-section support-section">
            <div className="section-header">
              <div>
                <p className="eyebrow">Open Tickets</p>
                <h3>Escalation Queue</h3>
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
                <p className="eyebrow">My Tickets</p>
                <h3>Tickets Assigned To You</h3>
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
            <form className="profile-form" onSubmit={handleProfileSave}>
              <div className="mb-3">
                <label className="form-label" htmlFor="agent-full-name">
                  Full name
                </label>
                <input
                  id="agent-full-name"
                  name="full_name"
                  type="text"
                  className="form-control"
                  value={profileForm.full_name}
                  onChange={handleProfileChange}
                  placeholder="Enter your name"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="agent-email">
                  Email
                </label>
                <input id="agent-email" type="email" className="form-control" value={displayEmail} disabled />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="agent-phone">
                  Phone
                </label>
                <input
                  id="agent-phone"
                  name="phone"
                  type="tel"
                  className="form-control"
                  value={profileForm.phone}
                  onChange={handleProfileChange}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="d-flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary-saas px-4" disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-saas px-4"
                  onClick={loadProfile}
                  disabled={profileSaving}
                >
                  Refresh
                </button>
              </div>
            </form>
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
          <div className="sidebar-identity mb-4">
            <p className="eyebrow sidebar-label">Support Agent</p>
            <h3 className="sidebar-name">{displayName}</h3>
            <p className="muted-email">{displayEmail}</p>
          </div>

          <div className="sidebar-divider" />

          {GROUPED_SUPPORT_SECTIONS.map(({ group, items }) => (
            <div className="sidebar-group" key={group}>
              <p className="text-muted text-uppercase small fw-semibold mb-2">
                {group}
              </p>
              <nav className="dashboard-nav">
                {items.map((section) => (
                  <Link
                    key={section.id}
                    className={`sidebar-link ${
                      activeSection === section.id ? "active" : ""
                    }`}
                    to={section.id === defaultSection ? "/dashboard/customer-support" : `/dashboard/customer-support/${section.id}`}
                  >
                    {section.label}
                  </Link>
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
              <h2 className="mb-1">Ticket Desk</h2>
              <p className="text-muted mb-0">
                Monitor escalations, claim tickets, and keep customers informed in real-time.
              </p>
            </div>
            <div className="hero-actions">
              <button className="btn btn-outline-saas" onClick={loadSessions}>
                Refresh data
              </button>
            </div>
          </section>

          {renderSection()}
        </main>
      </div>
    </div>
  );
};

export default CustomerSupportDashboard;
