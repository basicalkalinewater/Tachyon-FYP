import React, { useEffect, useRef, useState } from "react";
import "../styles/RasaWidget.css";

const RASA_ENDPOINT = import.meta.env.VITE_RASA_URL || "http://localhost:5005/webhooks/rest/webhook";

const QUICK_REPLIES = [
  { title: "FAQs", payload: "faq" },
  { title: "Shipping info", payload: "shipping" },
  { title: "Return policy", payload: "returns" },
  { title: "Order status", payload: "order status" },
  { title: "Products", payload: "products" },
];

const RasaWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi, I'm Tachyon. How can I help?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.body.classList.contains("theme-dark")
  );

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

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { from: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(RASA_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "web-user", message: text }),
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const botResponses = data.map((d) => ({ from: "bot", text: d.text || "" }));
        setMessages((prev) => [...prev, ...botResponses]);
      } else {
        setMessages((prev) => [...prev, { from: "bot", text: "I'm not sure, can you rephrase?" }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { from: "bot", text: "Connection issue. Try again." }]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!sending) sendMessage(input);
  };

  return (
    <>
      <div className={`chat-widget ${open ? "open" : ""}`}>
        {open && (
          <div className="chat-window shadow">
            <div className="chat-header">
              <span>Chat with Tachyon</span>
              <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
                ×
              </button>
            </div>
            <div className="chat-body">
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.from}`}>
                  {msg.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-quick-replies">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr.payload}
                  className="btn btn-outline-primary btn-sm rounded-pill"
                  onClick={() => sendMessage(qr.payload)}
                  disabled={sending}
                >
                  {qr.title}
                </button>
              ))}
            </div>
            <form className="chat-input" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
              />
              <button type="submit" className="btn btn-primary" disabled={sending}>
                Send
              </button>
            </form>
          </div>
        )}
        <div className="chat-toggle-wrapper">
          <div className="chat-bubble">
            <span className="me-1">
            </span>
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
