import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout, selectCurrentUser } from "../redux/authSlice";
import { toast } from "react-hot-toast";
import {
  fetchSupportSessions,
  fetchSessionDetail,
  claimSession,
  sendAgentMessage,
  resolveSession,
} from "../api/support";
import { SUPPORT_BASE_URL } from "../api/client";

import "../styles/dashboard.css"; // reuse the SAME dashboard styling

// Support dashboard sections
const SUPPORT_SECTIONS = [
  { id: "inbox", label: "Incoming Chats", group: "Chat Management" },
  { id: "assigned", label: "My Active Chats", group: "Chat Management" },
  { id: "history", label: "Chat History", group: "Chat Management" },
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

  const handleLogout = () => {
    dispatch(logout());
    toast.success("Logged out successfully");
  };

  const agentId = user?.id;
  const displayEmail = user?.email || "";
  const displayName =
    (user?.fullName && user.fullName.trim()) || displayEmail || "Support Agent";

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
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = (sessionId) => {
    // close prior stream
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    loadSessionDetail(sessionId).then(() => {
      const es = new EventSource(`${SUPPORT_BASE_URL}/sessions/${sessionId}/stream`);
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
      await loadSessionDetail(selectedSession.id);
      await loadSessions();
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
      await loadSessions();
      await loadSessionDetail(selectedSession.id);
    } catch (err) {
      toast.error(err.message || "Failed to resolve session");
    }
  };

  const renderSessionList = (emptyLabel) => (
    <div className="card-saas">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <p className="text-muted text-uppercase small fw-semibold mb-1">
            Handover Queue
          </p>
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
        <div className="list-group">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`list-group-item list-group-item-action ${
                selectedSession?.id === session.id ? "active" : ""
              }`}
              onClick={() => handleSelectSession(session.id)}
            >
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-semibold">Chat #{session.id}</div>
                  <div className="text-muted small">
                    Customer: {session.customer_email || "Unknown"}
                  </div>
                </div>
                <span className="badge bg-secondary text-uppercase">
                  {session.status}
                </span>
              </div>
              {session.agent_email && (
                <div className="text-muted small mt-1">
                  Assigned to {session.agent_email}
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
        <div className="card-saas h-100 d-flex align-items-center justify-content-center text-center">
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
      <div className="card-saas h-100 d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div>
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Session {selectedSession.id}
            </p>
            <h4 className="mb-1">
              {selectedSession.customer_email || "New customer"}
            </h4>
            <p className="text-muted small mb-0">
              Status: {selectedSession.status}
              {selectedSession.agent_email
                ? ` • Assigned to ${selectedSession.agent_email}`
                : " • Unassigned"}
              {selectedSession.resolution_tag ? ` • Resolution: ${selectedSession.resolution_tag}` : ""}
            </p>
            {selectedSession.summary_email_sent !== undefined && (
              <p className="text-muted small mb-0">{summarySentLabel}</p>
            )}
          </div>
          {canClaim && (
            <button
              className="btn btn-primary"
              onClick={() => handleClaim(selectedSession.id)}
            >
              Claim session
            </button>
          )}
        </div>

        <div
          className="flex-grow-1 border rounded p-3 mb-3 overflow-auto"
          style={{ minHeight: 260 }}
        >
          {loadingDetail ? (
            <p className="text-muted small mb-0">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-muted small mb-0">No messages yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`mb-3 ${msg.sender_role === "agent" ? "text-end" : ""}`}
                >
                  <div
                    className={`d-inline-block p-2 rounded ${
                      msg.sender_role === "agent"
                        ? "bg-primary text-white"
                        : "bg-light"
                    }`}
                  >
                    <div className="small fw-semibold mb-1">
                      {msg.sender_role === "agent" ? "Agent" : "Customer"}
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
                  <td>{s.customer_email || "Unknown"}</td>
                  <td>{s.agent_email || "Unassigned"}</td>
                  <td className="text-capitalize">{s.status}</td>
                  <td>{s.resolution_tag || "—"}</td>
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

  const renderSection = () => {
    switch (activeSection) {
      case "inbox":
        return (
          <section className="dashboard-section">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Incoming Chats
            </p>
            <h3 className="mb-3">Escalated Chats Queue</h3>
            <div className="row g-3">
              <div className="col-lg-4">
                {renderSessionList("No pending escalations right now.")}
              </div>
              <div className="col-lg-8">{renderChatDetail()}</div>
            </div>
          </section>
        );
      case "assigned":
        return (
          <section className="dashboard-section">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              My Active Chats
            </p>
            <h3 className="mb-3">Chats Assigned To You</h3>
            <div className="row g-3">
              <div className="col-lg-4">
                {renderSessionList("No active chats assigned to you.")}
              </div>
              <div className="col-lg-8">{renderChatDetail()}</div>
            </div>
          </section>
        );
      case "history":
        return renderHistory();
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
        <main className="dashboard-content">{renderSection()}</main>
      </div>
    </div>
  );
};

export default CustomerSupportDashboard;
