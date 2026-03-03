import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { selectCurrentUser } from "../redux/authSlice";
import { SUPPORT_BASE_URL, getSessionToken } from "../api/client";
import { fetchFaqs, searchFaqs } from "../api/content";
import "../styles/RasaWidget.css";

const RASA_ENDPOINT = import.meta.env.VITE_RASA_URL || "http://localhost:5005/webhooks/rest/webhook";
// Support routes for customer widget
const SUPPORT_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions`;          // POSTs etc.
const SUPPORT_PUBLIC_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions_public`; // customer-authenticated GET
const QUICK_REPLIES = [
  { title: "FAQs", payload: "FAQ" },
  { title: "Shipping & Returns", payload: "Shipping & Returns" },
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

const buildDefaultMessages = () => ([
  { from: "bot", text: "Hi, I'm Tachyon. Your virtual assistant! How can I help?", timestamp: Date.now() },
]);

const buildAuthHeaders = (includeJson = true) => {
  const headers = includeJson ? { "Content-Type": "application/json" } : {};
  const token = getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const RasaWidget = () => {
  const currentUser = useSelector(selectCurrentUser);
  const userRole = currentUser?.role;
  const isLoggedIn = Boolean(currentUser);
  const isRestrictedRole = userRole === "admin" || userRole === "support";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(buildDefaultMessages);
  const [faqMenu, setFaqMenu] = useState({ open: false, loading: false, items: [] });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("bot"); // bot | agent
  const [sessionId, setSessionId] = useState(null);
  const [agentReady, setAgentReady] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [queueInfo, setQueueInfo] = useState(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.body.classList.contains("theme-dark")
  );
  const [csatRating, setCsatRating] = useState(0);
  const [csatFeedback, setCsatFeedback] = useState("");
  const [csatSubmitting, setCsatSubmitting] = useState(false);
  const [csatSubmitted, setCsatSubmitted] = useState(false);
  const [csatSessionId, setCsatSessionId] = useState(null);
  const senderId = currentUser?.id || null;
  const historyKey = senderId ? `chat_history:${senderId}` : null;
  const historyMetaKey = senderId ? `chat_history_meta:${senderId}` : null;
  const hydratedRef = useRef(false);
  const [hydrating, setHydrating] = useState(true);

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

  useEffect(() => {
    hydratedRef.current = false;
  }, [senderId]);

  useEffect(() => {
    if (!senderId) {
      if (historyKey) {
        try {
          localStorage.removeItem(historyKey);
          if (historyMetaKey) localStorage.removeItem(historyMetaKey);
        } catch {
          // ignore storage errors
        }
      }
      setMessages(buildDefaultMessages());
      return;
    }
    if (!historyKey || hydratedRef.current) return;
    try {
      const metaRaw = historyMetaKey ? localStorage.getItem(historyMetaKey) : null;
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        const lastUpdated = meta?.lastUpdated;
        if (lastUpdated && Date.now() - Number(lastUpdated) > 30 * 60 * 1000) {
          localStorage.removeItem(historyKey);
          if (historyMetaKey) localStorage.removeItem(historyMetaKey);
        }
      }
    } catch {
      // ignore meta errors
    }
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored) && stored.length > 0) {
          setMessages(stored);
        }
      }
    } catch {
      // ignore cache errors
    }
    hydratedRef.current = true;
  }, [senderId, historyKey, historyMetaKey]);

  useEffect(() => {
    if (!senderId || !historyKey) return;
    try {
      const payload = messages.slice(-200);
      localStorage.setItem(historyKey, JSON.stringify(payload));
      if (historyMetaKey) {
        localStorage.setItem(historyMetaKey, JSON.stringify({ lastUpdated: Date.now() }));
      }
    } catch {
      // ignore storage errors
    }
  }, [messages, senderId, historyKey, historyMetaKey]);

  const appendMessage = (from, text, timestamp, typeOverride) => {
    const isCsat = isCsatPrompt(text);
    const type = typeOverride || (isCsat ? "csat" : "text");
    setMessages((prev) => [
      ...prev,
      { from, text, timestamp: timestamp || Date.now(), type },
    ]);
  };

  const openFaqMenu = async () => {
    setFaqMenu({ open: true, loading: true, items: [] });
    try {
      const res = await fetchFaqs();
      const list = res?.data || res || [];
      setFaqMenu({ open: true, loading: false, items: Array.isArray(list) ? list : [] });
    } catch {
      setFaqMenu({ open: true, loading: false, items: [] });
    }
  };

  const closeFaqMenu = () => {
    setFaqMenu((prev) => ({ ...prev, open: false }));
  };

  const fetchSessionMessages = async (sessId) => {
    const controller = new AbortController();
    try {
      const res = await fetch(`${SUPPORT_PUBLIC_SESSIONS_URL}/${sessId}`, {
        signal: controller.signal,
        headers: buildAuthHeaders(false),
      });
      const data = await res.json();
      const sessionData = data?.data?.session || data?.session || {};
      const sessionStatus = sessionData.status;
      const name =
        (sessionData.agent_full_name && sessionData.agent_full_name.trim()) ||
        (sessionData.agent_email && sessionData.agent_email.trim()) ||
        "";
      if (name) {
        setAgentName(name);
      }
      if (sessionStatus === "closed") {
        setCsatSessionId(sessId);
        setMode("bot");
        setAgentReady(false);
        setQueueInfo(null);
        setSessionId(null);
        localStorage.removeItem("support_session_id");
      }
      const mapped =
        (data?.data?.messages || data?.messages || []).map((m) => {
          const ts = m.created_at || m.timestamp || Date.now();
          const text = m.message;
          const isCsat = isCsatPrompt(text);
          const isAgent = m.sender_role === "agent";
          const displayAgent = (name || "Support Agent").trim();
          return {
            from: m.sender_role === "system" || isAgent ? "bot" : "user",
            author: isAgent ? `${displayAgent} - Support Agent` : "",
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

  const mergeIncomingSessionMessages = (incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const mapped = incoming.map((m) => {
      const ts = m.created_at || m.timestamp || Date.now();
      const text = m.message;
      const isCsat = isCsatPrompt(text);
      const isAgent = m.sender_role === "agent";
      const displayAgent = (agentName || "Support Agent").trim();
      return {
        from: m.sender_role === "system" || isAgent ? "bot" : "user",
        author: isAgent ? `${displayAgent} - Support Agent` : "",
        text,
        id: m.id,
        timestamp: ts,
        type: isCsat ? "csat" : "text",
      };
    });
    setMessages((prev) => {
      const existingIds = new Set(prev.filter((p) => p.id).map((p) => p.id));
      const deduped = mapped.filter((m) => !m.id || !existingIds.has(m.id));
      if (!deduped.length) return prev;
      return [...prev, ...deduped];
    });
  };

  useEffect(() => {
    if (mode !== "agent" || !sessionId) return;
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
      ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        mergeIncomingSessionMessages(Array.isArray(payload) ? payload : []);
      } catch {
        // ignore malformed websocket payloads
      }
    };
    ws.onerror = () => {
      ws.close();
    };
    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mode, sessionId, agentName]);

  useEffect(() => {
    if (mode !== "agent" || !sessionId) return;
    fetchSessionMessages(sessionId);
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        fetchSessionMessages(sessionId);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [mode, sessionId]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Restore active support session after refresh (if any)
  useEffect(() => {
    if (!senderId) {
      setHydrating(false);
      return;
    }
    const restore = async () => {
      const storedSessionId = localStorage.getItem("support_session_id");
      if (!storedSessionId) {
        setHydrating(false);
        return;
      }
      try {
        // Check queue status first to see if a session is active
        const res = await fetch(`${SUPPORT_BASE_URL}/queue/${senderId}`, {
          headers: buildAuthHeaders(false),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.session_id) {
            setMode("agent");
            setSessionId(data.data.session_id);
            setCsatSessionId(data.data.session_id);
            setAgentReady(data.data.status === "in_progress");
            fetchSessionMessages(data.data.session_id);
            setHydrating(false);
            return;
          }
        }
      } catch {
        // ignore and fallback to stored session
      }
      // Fallback: try the last stored session id
      setMode("agent");
      setSessionId(storedSessionId);
      setCsatSessionId(storedSessionId);
      setAgentReady(true);
      fetchSessionMessages(storedSessionId);
      setHydrating(false);
    };
    restore();
  }, [senderId]);

  const fetchQueueStatus = async () => {
    if (!senderId) return;
    try {
      const res = await fetch(`${SUPPORT_BASE_URL}/queue/${senderId}`, {
        headers: buildAuthHeaders(false),
      });
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
          setCsatSessionId(data.data.session_id);
          localStorage.setItem("support_session_id", data.data.session_id);
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
    if (!senderId) {
      appendMessage("bot", "Please login to use the chatbot.");
      return;
    }
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
        headers: buildAuthHeaders(true),
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
    const targetSessionId = sessionId || csatSessionId;
    if (!targetSessionId || !csatRating) {
      if (!targetSessionId) {
        appendMessage("bot", "Couldn't identify the session for your feedback. Please try again.");
      }
      return;
    }
    setCsatSubmitting(true);
    try {
      await fetch(`${SUPPORT_SESSIONS_URL}/${targetSessionId}/csat`, {
        method: "POST",
        headers: buildAuthHeaders(true),
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
    if (!senderId) {
      appendMessage("bot", "Please login to use live chat.");
      return;
    }
    appendMessage("bot", "Connecting you to a live agent...");
    setAgentReady(false);
    setQueueInfo(null);
    setSessionId(null); // reset any previous closed session
    setCsatSessionId(null);
    setCsatSubmitted(false);
    setCsatRating(0);
    setCsatFeedback("");
    setMode("agent");
    setSending(true);
    try {
      const res = await fetch(`${SUPPORT_SESSIONS_URL}/from_rasa`, {
        method: "POST",
        headers: buildAuthHeaders(true),
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
        setCsatSessionId(newSessionId);
        localStorage.setItem("support_session_id", newSessionId);
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

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    closeFaqMenu();
    if (!isLoggedIn) {
      appendMessage("bot", "Please login to use the chatbot.");
      return;
    }
    // If user explicitly asks for a human, trigger the same flow as the quick-reply handoff
    const wantsHuman = /\b(live agent|human agent|talk to (a )?human|talk to (an )?agent)\b/i.test(trimmed);
    if (wantsHuman) {
      startHandoff(trimmed);
      return;
    }
    if (mode === "agent" && sessionId) {
      await sendToAgent(trimmed);
    } else {
      try {
        if (trimmed.length >= 3) {
          const res = await searchFaqs(trimmed);
          const list = res?.data || res || [];
          if (Array.isArray(list) && list.length > 0) {
            const top = list[0];
            appendMessage("bot", top.answer || "Here's what I found in our FAQs.");
            return;
          }
        }
      } catch {
        // ignore and fallback to Rasa
      }
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
    const withLinks = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const normalizedHref = String(href || "").trim();
      const safeHref = /^(https?:\/\/|mailto:|tel:)/i.test(normalizedHref) ? normalizedHref : "#";
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    const withInline = withLinks
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    const lines = withInline.split("\n");
    let html = "";
    let inList = false;
    for (const line of lines) {
      const match = line.match(/^\s*[-*]\s+(.*)$/);
      if (match) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${match[1]}</li>`;
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += line ? `${line}<br />` : "<br />";
      }
    }
    if (inList) html += "</ul>";
    return html;
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
              {!isLoggedIn ? (
                <div className="p-3">
                  <div className="alert alert-light border mb-0">
                    <div className="fw-semibold mb-1">Login required</div>
                    <div className="small text-muted mb-3">
                      Please create an account or login to use the chatbot.
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => window.location.href = "/login"}
                    >
                      Login / Sign up
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`chat-message ${msg.from} ${msg.type ? `type-${msg.type}` : ""}`}>
                      <div className="chat-message-bubble">
                        {msg.author && <div className="chat-author">{msg.author}</div>}
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
                  {faqMenu.open && (
                    <div className="chat-message bot">
                      <div className="chat-message-bubble">
                        <div className="fw-semibold mb-2">Choose a question</div>
                        {faqMenu.loading ? (
                          <div className="text-muted small">Loading FAQs...</div>
                        ) : faqMenu.items.length === 0 ? (
                          <div className="text-muted small">No FAQs found yet.</div>
                        ) : (
                          <div className="d-flex flex-column gap-2">
                            {faqMenu.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="btn btn-outline-primary btn-sm text-start"
                                onClick={() => {
                                  closeFaqMenu();
                                  const questionText = (item.question || "FAQ").trim();
                                  const answerText = (item.answer || "").trim() || "Here's the FAQ answer.";
                                  appendMessage("bot", questionText, undefined, "faq");
                                  appendMessage("bot", answerText);
                                }}
                              >
                                {item.question}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            {isLoggedIn && mode === "agent" && !agentReady && (
              <div className="px-3 py-2 text-muted small">
                {queueInfo?.position
                  ? `You're #${queueInfo.position} in the queue. We'll notify you when an agent joins.`
                  : "Waiting for an agent to join. We'll notify you when they're ready."}
              </div>
            )}
            {isLoggedIn && mode !== "agent" && (
              <div className="chat-quick-replies">
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.payload}
                    className="btn btn-outline-primary btn-sm rounded-pill"
                    onClick={() => {
                      if (qr.payload === "FAQ") {
                        openFaqMenu();
                        return;
                      }
                      if (qr.payload === "__handoff__") {
                        startHandoff("I need to talk to a human agent");
                        return;
                      }
                      closeFaqMenu();
                      sendToBot(qr.payload);
                    }}
                    disabled={sending}
                  >
                    {qr.title}
                  </button>
                ))}
              </div>
            )}
            {isLoggedIn && (
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

