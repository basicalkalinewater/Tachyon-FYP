import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { selectCurrentUser } from "../redux/authSlice";
import { SUPPORT_BASE_URL } from "../api/client";
import "../styles/RasaWidget.css";

const RASA_ENDPOINT = import.meta.env.VITE_RASA_URL || "http://localhost:5005/webhooks/rest/webhook";
// Support routes for customer widget
const SUPPORT_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions`;          // POSTs etc.
const SUPPORT_GUEST_ESCALATE_URL = `${SUPPORT_BASE_URL}/guest/escalate`;
const SUPPORT_PUBLIC_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions_public`; // public GET
const QUICK_REPLIES = [
  { title: "FAQs", payload: "FAQ" },
  { title: "Shipping info", payload: "Shipping Info" },
  { title: "Return policy", payload: "Return Policy" },
  { title: "Order status", payload: "Order Status" },
  { title: "Products", payload: "Products" },
  { title: "Talk to human", payload: "__handoff__" },
];

const isCsatPrompt = (text) =>
  typeof text === "string" &&
  text.toLowerCase().includes("rate") &&
  (text.includes("1-5") || text.includes("1 to 5") || text.toLowerCase().includes("stars"));

const CsatBlock = ({ submitting, submitted, rating, feedback, onSelect, onFeedback, onSubmit }) => {
  return (
    <div className="csat-block">
      {submitted ? (
        <div>Thank you for your feedback!</div>
      ) : (
        <>
          <div className="mb-2">How was your experience with Tachyon Chatbot?</div>
          <div className="csat-stars mb-2" role="group" aria-label="CSAT star rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`csat-star ${rating >= star ? "active" : ""}`}
                onClick={() => onSelect(star)}
                disabled={submitting}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className="form-control form-control-sm mb-2"
            placeholder="Optional feedback"
            value={feedback}
            onChange={(e) => onFeedback(e.target.value)}
            disabled={submitting}
            rows={2}
          />
          <button className="btn btn-primary btn-sm w-100" onClick={onSubmit} disabled={submitting || !rating}>
            {submitting ? "Sending..." : "Submit"}
          </button>
        </>
      )}
    </div>
  );
};

const RasaWidget = () => {
  const currentUser = useSelector(selectCurrentUser);
  const userRole = currentUser?.role;
  const isLoggedIn = Boolean(currentUser);
  const isRestrictedRole = userRole === "admin" || userRole === "support";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi, I'm Tachyon. Your virtual assistant! How can I help?", timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("bot"); // bot | agent
  const [sessionId, setSessionId] = useState(null);
  const [agentReady, setAgentReady] = useState(false);
  const [queueInfo, setQueueInfo] = useState(null);
  const messagesEndRef = useRef(null);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.body.classList.contains("theme-dark")
  );
  const [csatRating, setCsatRating] = useState(0);
  const [csatFeedback, setCsatFeedback] = useState("");
  const [csatSubmitting, setCsatSubmitting] = useState(false);
  const [csatSubmitted, setCsatSubmitted] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [senderId] = useState(() => {
    if (typeof window === "undefined") return "web-user";
    const existing = localStorage.getItem("rasa_sender_id");
    if (existing) return existing;
    const generated = `web-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    localStorage.setItem("rasa_sender_id", generated);
    return generated;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.body.classList.contains("theme-dark"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const appendMessage = (from, text, timestamp) => {
    const isCsat = isCsatPrompt(text);
    setMessages((prev) => [
      ...prev,
      { from, text, timestamp: timestamp || Date.now(), type: isCsat ? "csat" : "text" },
    ]);
  };

  const fetchSessionMessages = async (sessId) => {
    const controller = new AbortController();
    try {
      const res = await fetch(`${SUPPORT_PUBLIC_SESSIONS_URL}/${sessId}`, { signal: controller.signal });
      const data = await res.json();
      const sessionStatus = data?.data?.session?.status || data?.session?.status;
      if (sessionStatus === "closed") {
        setMode("bot");
        setAgentReady(false);
        setQueueInfo(null);
      }
      const mapped =
        (data?.data?.messages || data?.messages || []).map((m) => {
          const ts = m.created_at || m.timestamp || Date.now();
          const text = m.message;
          const isCsat = isCsatPrompt(text);
          return {
            from: m.sender_role === "agent" || m.sender_role === "system" ? "bot" : "user",
            text,
            id: m.id,
            timestamp: ts,
            type: isCsat ? "csat" : "text",
          };
        }) || [];
      if (mapped.length > 0) {
        setMessages((prev) => {
          // remove local pending user echoes before merging
          const cleaned = prev.filter((p) => !(p.from === "user" && p.pending));
          const existingIds = new Set(cleaned.filter((p) => p.id).map((p) => p.id));
          const merged = [...cleaned];
          mapped.forEach((m) => {
            if (m.id && existingIds.has(m.id)) return;
            merged.push(m);
          });
          return merged;
        });
      }
    } catch {
      // silent poll failure
    } finally {
      controller.abort();
    }
  };

  useEffect(() => {
    if (mode !== "agent" || !sessionId) return;
    fetchSessionMessages(sessionId);
    const interval = setInterval(() => fetchSessionMessages(sessionId), 4000);
    return () => clearInterval(interval);
  }, [mode, sessionId]);

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch(`${SUPPORT_BASE_URL}/queue/${senderId}`);
      if (res.status === 404) {
        setQueueInfo(null);
        setAgentReady(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data?.data) {
        setQueueInfo(data.data);
        if (data.data.session_id && !sessionId) {
          setSessionId(data.data.session_id);
        }
        const ready = data.data.status === "in_progress";
        setAgentReady(ready);
        if (ready && data.data.session_id) {
          fetchSessionMessages(data.data.session_id);
        }
      }
    } catch {
      // silent queue poll failure
    }
  };

  useEffect(() => {
    if (mode !== "agent") return;
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 4000);
    return () => clearInterval(interval);
  }, [mode, senderId]);

  const sendToBot = async (text) => {
    appendMessage("user", text);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(RASA_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderId, message: text }),
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const botResponses = data.map((d) => {
          const t = d.text || "";
          const isCsat = isCsatPrompt(t);
          return {
            from: "bot",
            text: t,
            timestamp: Date.now(),
            type: isCsat ? "csat" : "text",
          };
        });
        setMessages((prev) => [...prev, ...botResponses]);
      } else {
        appendMessage("bot", "I'm not sure, can you rephrase?");
      }
    } catch {
      appendMessage("bot", "Connection issue. Try again.");
    } finally {
      setSending(false);
    }
  };

  const sendToAgent = async (text) => {
    if (!sessionId || !agentReady) {
      appendMessage("bot", "No active agent session. Please try requesting a human again.");
      return;
    }
    // Optimistic message (will be replaced by server copy on next poll)
    setMessages((prev) => [
      ...prev,
      { from: "user", text, timestamp: Date.now(), pending: true },
    ]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${SUPPORT_SESSIONS_URL}/${sessionId}/customer/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        appendMessage("bot", body?.error || "Couldn't reach the agent right now. Please try again.");
      }
    } catch {
      appendMessage("bot", "Could not send to agent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const submitCsat = async () => {
    if (!sessionId || !csatRating) return;
    setCsatSubmitting(true);
    try {
      await fetch(`${SUPPORT_SESSIONS_URL}/${sessionId}/csat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: csatRating, feedback: csatFeedback }),
      });
      setCsatSubmitted(true);
    } catch {
      appendMessage("bot", "Couldn't save your rating right now. Please try again.");
    } finally {
      setCsatSubmitting(false);
    }
  };

  const startHandoff = async (initialText) => {
    appendMessage("bot", "Connecting you to a live agent...");
    setAgentReady(false);
    setQueueInfo(null);
    setSessionId(null); // reset any previous closed session
    setMode("agent");
    setSending(true);
    try {
      const res = await fetch(`${SUPPORT_SESSIONS_URL}/from_rasa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: senderId,
          last_message: initialText || "Need a human agent",
          customer_id: currentUser?.id,
        }),
      });
      const data = await res.json();
      const newSessionId = data?.data?.session_id;
      const ticketNum = data?.data?.ticket_number;
      if (newSessionId) {
        setSessionId(newSessionId);
        if (ticketNum) appendMessage("bot", `Ticket ${ticketNum} created.`);
        setAgentReady(true); // allow messaging immediately; backend will queue if not yet claimed
        fetchQueueStatus();
      } else {
        appendMessage("bot", "Could not start agent session.");
        setMode("bot");
      }
    } catch {
      appendMessage("bot", "Could not start agent session.");
      setMode("bot");
    } finally {
      setSending(false);
    }
  };

  const startGuestHandoff = (initialText) => {
    // If already logged in, bypass guest form and hand off directly
    if (isLoggedIn) {
      startHandoff(initialText || "I need a human agent");
      return;
    }
    setHandoffMessage(initialText || "I need a human agent");
    setShowGuestForm(true);
  };

  const submitGuestForm = async (e) => {
    if (e) e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) {
      appendMessage("bot", "Please enter your name and email to connect with an agent.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(SUPPORT_GUEST_ESCALATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: guestName.trim(),
          email: guestEmail.trim(),
          sender_id: senderId,
          last_message: handoffMessage || "Need a human agent",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.data?.session_id) {
        throw new Error(data?.error || "Could not start a ticket");
      }
      const newSessionId = data.data.session_id;
      const ticket = data.data.ticket_number;
      setSessionId(newSessionId);
      setAgentReady(true);
      setMode("agent");
      setShowGuestForm(false);
      appendMessage("bot", `Ticket ${ticket || newSessionId} created.`);
      appendMessage("bot", "Connecting you to a live agent...");
      fetchQueueStatus();
    } catch (err) {
      appendMessage("bot", err.message || "Could not start a ticket right now.");
      setMode("bot");
    } finally {
      setSending(false);
    }
  };

  const cancelGuestForm = () => {
    setShowGuestForm(false);
    setGuestName("");
    setGuestEmail("");
    setMode("bot");
    appendMessage("bot", "No problem—I’ll stay with the bot. Ask me anything!");
  };

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // If user explicitly asks for a human, trigger the same flow as the quick-reply handoff
    const wantsHuman = /\b(live agent|human agent|talk to (a )?human|talk to (an )?agent)\b/i.test(trimmed);
    if (wantsHuman) {
      startGuestHandoff(trimmed);
      return;
    }
    if (mode === "agent" && sessionId) {
      await sendToAgent(trimmed);
    } else {
      await sendToBot(trimmed);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!sending) sendMessage(input);
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatMarkdown = (text) => {
    if (!text) return "";
    const escapeHtml = (str) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const escaped = escapeHtml(text);
    const withLinks = escaped.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return withLinks.replace(/\n/g, "<br />");
  };

  return (
    <>
      <div
        className={`chat-widget ${open ? "open" : ""}`}
        style={isRestrictedRole ? { display: "none" } : undefined}
      >
        {open && (
          <div className="chat-window shadow">
            <div className="chat-header">
              <span>Chat with Tachyon</span>
              <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
                x
              </button>
            </div>
            <div className="chat-body">
              {showGuestForm ? (
                <div className="guest-form p-2">
                  <h5 className="mb-2">Tell us how to reach you</h5>
                  <div className="mb-2">
                    <label className="form-label small mb-1" htmlFor="guest-name">Full name</label>
                    <input
                      id="guest-name"
                      type="text"
                      className="form-control form-control-sm"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small mb-1" htmlFor="guest-email">Email</label>
                    <input
                      id="guest-email"
                      type="email"
                      className="form-control form-control-sm"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex gap-2">
                      <button className="btn btn-primary btn-sm w-100" onClick={submitGuestForm} disabled={sending}>
                        {sending ? "Starting..." : "Proceed"}
                      </button>
                      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={cancelGuestForm}>
                        Exit
                      </button>
                    </div>
                    {!isLoggedIn && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm text-start px-0"
                        onClick={() => window.location.href = "/login"}
                      >
                        Already a member? Login here
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`chat-message ${msg.from}`}>
                      <div className="chat-message-bubble">
                        {msg.type === "csat" ? (
                          <CsatBlock
                            submitting={csatSubmitting}
                            submitted={csatSubmitted}
                            rating={csatRating}
                            feedback={csatFeedback}
                            onSelect={(r) => setCsatRating(r)}
                            onFeedback={(t) => setCsatFeedback(t)}
                            onSubmit={() => submitCsat()}
                          />
                        ) : msg.text?.includes("chat has been closed") ? (
                          <>
                            <span dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} />
                            <div className="mt-2 small text-muted">You can continue chatting with the bot.</div>
                          </>
                        ) : msg.from === "bot" ? (
                          <span dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} />
                        ) : (
                          msg.text
                        )}
                      </div>
                      <div className="chat-meta">
                        <span className="chat-meta-time">{formatTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            {!showGuestForm && mode === "agent" && !agentReady && (
              <div className="px-3 py-2 text-muted small">
                {queueInfo?.position
                  ? `You're #${queueInfo.position} in the queue. We'll notify you when an agent joins.`
                  : "Waiting for an agent to join. We'll notify you when they're ready."}
              </div>
            )}
            {!showGuestForm && mode !== "agent" && (
              <div className="chat-quick-replies">
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.payload}
                    className="btn btn-outline-primary btn-sm rounded-pill"
                    onClick={() => {
                      if (qr.payload === "__handoff__") {
                        startGuestHandoff("I need to talk to a human agent");
                      } else {
                        sendMessage(qr.payload);
                      }
                    }}
                    disabled={sending}
                  >
                    {qr.title}
                  </button>
                ))}
              </div>
            )}
            {!showGuestForm && (
              <form className="chat-input" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder={
                  mode === "agent"
                    ? agentReady
                      ? "Message the agent..."
                      : "Connecting to an agent..."
                    : "Type a message..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending || (mode === "agent" && !agentReady)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sending || (mode === "agent" && !agentReady)}
                >
                  Send
                </button>
              </form>
            )}
          </div>
        )}
        <div className="chat-toggle-wrapper">
          <button
            className={`chat-toggle-btn ${isDark ? "dark" : "light"} ${open ? "is-open" : ""}`}
            onClick={() => setOpen((p) => !p)}
            aria-label={open ? "Close chat" : "Open chat"}
          >
            {open ? (
              <svg className="chat-toggle-icon" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="22" className="toggle-ring" />
                <path
                  className="toggle-x"
                  d="M16 16l16 16m0-16L16 32"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg className="chat-toggle-icon" viewBox="0 0 48 48" aria-hidden="true">
                <defs>
                  <linearGradient id="toggleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--tw-primary-start, #6366f1)" />
                    <stop offset="100%" stopColor="var(--tw-primary-end, #0ea5e9)" />
                  </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="22" className="toggle-ring" />
                <path
                  className="toggle-bubble"
                  d="M14 14h20a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-7l-5.8 4.5a1 1 0 0 1-1.6-.8V28h-5.6a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2Z"
                  fill="url(#toggleGradient)"
                />
                <circle cx="20" cy="21" r="1.6" className="toggle-dot" />
                <circle cx="26" cy="21" r="1.6" className="toggle-dot" />
                <circle cx="32" cy="21" r="1.6" className="toggle-dot" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default RasaWidget;
