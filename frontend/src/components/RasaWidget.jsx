import React, { useEffect, useRef, useState } from "react";
import { SUPPORT_BASE_URL } from "../api/client";
import "../styles/RasaWidget.css";

const RASA_ENDPOINT = import.meta.env.VITE_RASA_URL || "http://localhost:5005/webhooks/rest/webhook";
// Support routes for customer widget
const SUPPORT_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions`;          // POSTs etc.
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
        <div>Thanks for your feedback!</div>
      ) : (
        <>
          <div className="mb-2">Rate your support experience:</div>
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
    setMessages((prev) => [...prev, { from, text, timestamp: timestamp || Date.now(), type: isCsat ? "csat" : "text" }]);
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
          const prevHasIds = prev.some((p) => p.id);
          const lastId = prevHasIds ? Math.max(...prev.filter((p) => p.id).map((p) => p.id)) : 0;
          const incomingNew = mapped.filter((m) => !prevHasIds || !m.id || m.id > lastId);
          if (!incomingNew.length) return prev;
          return prevHasIds ? [...prev, ...incomingNew] : incomingNew;
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

  // On mount, check if a session already exists for this sender (e.g., after refresh)
  useEffect(() => {
    const interval = setInterval(fetchQueueStatus, 6000);
    fetchQueueStatus();
    return () => clearInterval(interval);
  }, []);

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch(`${SUPPORT_BASE_URL}/queue/${senderId}`);
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
    appendMessage("user", text);
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
    setMode("agent");
    setSending(true);
    try {
      const res = await fetch(`${SUPPORT_SESSIONS_URL}/from_rasa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_id: senderId, last_message: initialText || "Need a human agent" }),
      });
      const data = await res.json();
      const newSessionId = data?.data?.session_id;
      if (newSessionId) {
        setSessionId(newSessionId);
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

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    if (mode === "agent" && sessionId) {
      await sendToAgent(text);
    } else {
      await sendToBot(text);
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
      <div className={`chat-widget ${open ? "open" : ""}`}>
        {open && (
          <div className="chat-window shadow">
            <div className="chat-header">
              <span>Chat with Tachyon</span>
              <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
                x
              </button>
            </div>
            <div className="chat-body">
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
            </div>
            {mode === "agent" && !agentReady && (
              <div className="px-3 py-2 text-muted small">
                {queueInfo?.position
                  ? `You're #${queueInfo.position} in the queue. We'll notify you when an agent joins.`
                  : "Waiting for an agent to join. We'll notify you when they're ready."}
              </div>
            )}
            <div className="chat-quick-replies">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr.payload}
                  className="btn btn-outline-primary btn-sm rounded-pill"
                  onClick={() => {
                    if (qr.payload === "__handoff__") {
                      startHandoff("I need to talk to a human agent");
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
            <form className="chat-input" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder={
                  mode === "agent"
                    ? agentReady
                      ? "Message the agent..."
                      : queueInfo?.position
                        ? `Waiting... you are #${queueInfo.position}`
                        : "Waiting for an agent to join..."
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
          </div>
        )}
        <div className="chat-toggle-wrapper">
          <button className="chat-toggle-btn" onClick={() => setOpen((p) => !p)} aria-label="Toggle chat">
            <span role="img" aria-label="chat">{isDark ? "🌙" : "😊"}</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default RasaWidget;

