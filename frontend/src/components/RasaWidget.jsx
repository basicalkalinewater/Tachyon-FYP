import React, { useEffect, useRef, useState } from "react";
import { SUPPORT_BASE_URL } from "../api/client";
import "../styles/RasaWidget.css";

const RASA_ENDPOINT = import.meta.env.VITE_RASA_URL || "http://localhost:5005/webhooks/rest/webhook";
const SUPPORT_SESSIONS_URL = `${SUPPORT_BASE_URL}/sessions`;

const QUICK_REPLIES = [
  { title: "FAQs", payload: "faq" },
  { title: "Shipping info", payload: "shipping" },
  { title: "Return policy", payload: "returns" },
  { title: "Order status", payload: "order status" },
  { title: "Products", payload: "products" },
  { title: "Talk to human", payload: "__handoff__" },
];

const RasaWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi, I'm Tachyon. How can I help?" },
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

  const appendMessage = (from, text) => {
    setMessages((prev) => [...prev, { from, text }]);
  };

  const fetchSessionMessages = async (sessId) => {
    try {
      const res = await fetch(`${SUPPORT_SESSIONS_URL}/${sessId}`);
      const data = await res.json();
      const mapped =
        (data?.data?.messages || data?.messages || []).map((m) => ({
          from: m.sender_role === "agent" || m.sender_role === "system" ? "bot" : "user",
          text: m.message,
          id: m.id,
        })) || [];
      if (mapped.length > 0) {
        setMessages(mapped);
      }
    } catch {
      // silent poll failure
    }
  };

  useEffect(() => {
    if (mode !== "agent" || !sessionId || !agentReady) return;
    fetchSessionMessages(sessionId);
    const interval = setInterval(() => fetchSessionMessages(sessionId), 2500);
    return () => clearInterval(interval);
  }, [mode, sessionId, agentReady]);

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
    const interval = setInterval(fetchQueueStatus, 2500);
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
        const botResponses = data.map((d) => ({ from: "bot", text: d.text || "" }));
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
      await fetch(`${SUPPORT_SESSIONS_URL}/${sessionId}/customer/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      // messages will refresh via polling
    } catch {
      appendMessage("bot", "Could not send to agent. Please try again.");
    } finally {
      setSending(false);
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
      if (!agentReady) {
        appendMessage(
          "bot",
          queueInfo?.position
            ? `You're #${queueInfo.position} in line. We'll connect you once an agent claims the chat.`
            : "Waiting for an agent to join. We'll connect you soon."
        );
        return;
      }
      await sendToAgent(text);
    } else {
      await sendToBot(text);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!sending) sendMessage(input);
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
                  {msg.from === "bot" ? (
                    <span dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} />
                  ) : (
                    msg.text
                  )}
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
          <div className="chat-bubble">
            <span className="me-1"></span>
            Need more help? Use our chatbot!
          </div>
          <button className="chat-toggle-btn" onClick={() => setOpen((p) => !p)} aria-label="Toggle chat">
            <span role="img" aria-label="chat">{isDark ? "🌙" : "😊"}</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default RasaWidget;
