import os
import time
import json
from contextlib import contextmanager

import psycopg2
import requests
import smtplib
from email.message import EmailMessage
from psycopg2.extras import RealDictCursor
from flask import Blueprint, jsonify, request, Response, stream_with_context
from dotenv import load_dotenv


TEST_CUSTOMER_ID = "923a82b6-7213-452d-b887-d795fd8cbcdc"
TEST_AGENT_ID = "046820b1-e032-4fa0-a64b-4bebe71d0739"
# -----------------------------
# Load .env from PROJECT ROOT
# -----------------------------
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)
print("DB_HOST:", os.getenv("DB_HOST"))

# -----------------------------
# DB connection configuration
# -----------------------------
DB_CONFIG = {
    "host": os.environ.get("DB_HOST"),
    "port": os.environ.get("DB_PORT", 5432),
    "dbname": os.environ.get("DB_NAME", "postgres"),
    "user": os.environ.get("DB_USER", "postgres"),
    "password": os.environ.get("DB_PASSWORD"),
}
print("DB_CONFIG:", DB_CONFIG)  # <-- Add this line temporarily to confirm
RASA_RELAY_URL = os.getenv("RASA_RELAY_URL", "http://localhost:5005/webhooks/rest/webhook")
# Direct push endpoint to inject agent messages as bot events into the conversation tracker
RASA_PUSH_URL = os.getenv(
    "RASA_PUSH_URL",
    "http://localhost:5005/conversations/{sender_id}/tracker/events",
)
RASA_FORWARD_URL = os.getenv(
    "RASA_FORWARD_URL",
    "http://localhost:4000/support/sessions/from_rasa/message",
)
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER or "no-reply@example.com")

# Basic sanity check
missing = [k for k, v in DB_CONFIG.items() if v in (None, "") and k != "sslmode"]
if missing:
    raise RuntimeError(f"Missing DB config values in .env: {', '.join(missing)}")

live_agent_bp = Blueprint("live_agent", __name__)

# Rest of your code stays the same...

@contextmanager
def get_db():
    """Open a DB connection and auto-commit/rollback."""
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Small helper to make JSON responses consistent
def ok(data=None):
    return jsonify({"success": True, "data": data})


def error(message, status=400):
    return jsonify({"success": False, "error": message}), status


def format_chat_summary(session_row, messages, resolution_tag):
    """Compose a simple text summary email body."""
    lines = []
    lines.append("Hi,")
    lines.append("")
    lines.append("Here is a summary of your recent support chat:")
    lines.append(f"- Chat ID: {session_row.get('id')}")
    lines.append(f"- Status: {session_row.get('status')}")
    if resolution_tag:
        lines.append(f"- Resolution: {resolution_tag}")
    lines.append("")
    lines.append("Conversation transcript:")
    for msg in messages or []:
        role = msg.get("sender_role") or msg.get("sender_type") or "unknown"
        created = msg.get("created_at")
        text = msg.get("message") or ""
        lines.append(f"[{created}] {role}: {text}")
    lines.append("")
    lines.append("Thank you,")
    lines.append("Customer Support")
    return "\n".join(lines)


def send_summary_email(to_email, subject, body):
    """Send summary email via SMTP; returns True/False."""
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD and to_email):
        print("WARN: SMTP config or recipient missing; skipping summary email")
        return False
    try:
        msg = EmailMessage()
        msg["From"] = EMAIL_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print("WARN: failed to send summary email:", e)
        return False


# -------------------------------------------------------------------
# RASA HANDOFF: Create new chat session when user requests human agent
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/from_rasa")
def create_session_from_rasa():
    """
    POST /support/sessions/from_rasa
    Called by Rasa when user says "I want to talk to human".
    Creates chat session + first message.
    """
    data = request.get_json(force=True, silent=True) or {}

    sender_id = data.get("sender_id")         # Rasa conversation ID
    last_message = data.get("last_message")   # user's message text

    if not sender_id or not last_message:
        return error("sender_id and last_message are required")

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            # 1) Create session (customer_id unknown yet → NULL)
            cur.execute(
                """
                INSERT INTO chat_sessions (
                    customer_id,
                    agent_id,
                    status,
                    rasa_sender_id,
                    last_updated
                )
                VALUES (%s, %s, 'pending', %s, NOW())
                RETURNING id;
                """,
                (TEST_CUSTOMER_ID, TEST_AGENT_ID, sender_id,),
            )
            session_row = cur.fetchone()
            session_id = session_row["id"]

            # 2) Insert first customer message
            cur.execute(
                """
                INSERT INTO chat_messages (
                    session_id,
                    sender_role,
                    sender_id,
                    message,
                    is_bot
                )
                VALUES (%s, 'customer', %s, %s, FALSE)
                RETURNING id;
                """,
                (session_id, TEST_CUSTOMER_ID, last_message),
            )
            message_row = cur.fetchone()

        return ok({
            "session_id": session_id,
            "first_message_id": message_row["id"],
            "note": "Session created from Rasa handoff"
        })

    except Exception as e:
        print("ERROR create_session_from_rasa:", e)
        return error(str(e), status=500)


# -------------------------------------------------------------------
# Append a customer message to an existing session by Rasa sender_id
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/from_rasa/message")
def append_message_from_rasa():
    """
    POST /support/sessions/from_rasa/message
    body: { "sender_id": "<rasa sender>", "last_message": "..." }
    Finds the latest open session for that sender and appends the message.
    """
    data = request.get_json(force=True, silent=True) or {}
    sender_id = data.get("sender_id")
    last_message = data.get("last_message")
    if not sender_id or not last_message:
        return error("sender_id and last_message are required")

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            cur.execute(
                """
                SELECT id, customer_id
                FROM chat_sessions
                WHERE rasa_sender_id = %s
                  AND status IN ('pending', 'in_progress')
                ORDER BY last_updated DESC
                LIMIT 1;
                """,
                (sender_id,),
            )
            session = cur.fetchone()
            if not session:
                return error("No open session for this sender", status=404)

            session_id = session["id"]
            customer_id = session["customer_id"] or TEST_CUSTOMER_ID

            cur.execute(
                """
                INSERT INTO chat_messages (
                  session_id,
                  sender_role,
                  sender_type,
                  sender_id,
                  message,
                  is_bot
                )
                VALUES (%s, 'customer', 'customer', %s, %s, FALSE)
                RETURNING id;
                """,
                (session_id, customer_id, last_message),
            )
            cur.fetchone()

            cur.execute(
                "UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;",
                (session_id,),
            )

        return ok({"session_id": session_id})
    except Exception as e:
        print("ERROR append_message_from_rasa:", e)
        return error(str(e), status=500)


# -------------------------------------------------------------------
# Direct customer channel: append a customer message by session id
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/<session_id>/customer/messages")
def send_customer_message(session_id):
    """
    POST /support/sessions/<session_id>/customer/messages
    body: { "message": "text", "customer_id": "<uuid>"? }
    Appends a customer message to an open session. Useful when bypassing Rasa.
    """
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message")
    customer_id = data.get("customer_id") or TEST_CUSTOMER_ID
    if not message:
        return error("message is required")

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            cur.execute(
                """
                SELECT id
                FROM chat_sessions
                WHERE id = %s
                  AND status IN ('pending', 'in_progress')
                """,
                (session_id,),
            )
            if not cur.fetchone():
                return error("Session not found or closed", status=404)

            cur.execute(
                """
                INSERT INTO chat_messages (
                  session_id,
                  sender_role,
                  sender_type,
                  sender_id,
                  message,
                  is_bot
                )
                VALUES (%s, 'customer', 'customer', %s, %s, FALSE)
                RETURNING id, created_at;
                """,
                (session_id, customer_id, message),
            )
            row = cur.fetchone()

            cur.execute(
                "UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;",
                (session_id,),
            )

        return ok({"message_id": row["id"], "created_at": row["created_at"]})
    except Exception as e:
        print("ERROR send_customer_message:", e)
        return error(str(e), status=500)


# -------------------------------------------------------------------
# SSE stream for session messages (lightweight push)
# -------------------------------------------------------------------
@live_agent_bp.get("/sessions/<session_id>/stream")
def stream_session(session_id):
    """
    SSE stream of new messages for a session.
    Emits JSON array of new messages when they arrive.
    """
    def event_stream():
        last_id = 0
        while True:
            try:
                with get_db() as conn:
                    cur = conn.cursor(cursor_factory=RealDictCursor)
                    cur.execute(
                        """
                        SELECT id, sender_role, sender_type, sender_id, message, is_bot, created_at
                        FROM chat_messages
                        WHERE session_id = %s AND id > %s
                        ORDER BY id ASC;
                        """,
                        (session_id, last_id),
                    )
                    rows = cur.fetchall() or []
                    if rows:
                        last_id = rows[-1]["id"]
                        yield f"data: {json.dumps(rows, default=str)}\n\n"
            except Exception as e:
                print("WARN: stream error:", e)
            time.sleep(1)

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")


# -------------------------------------------------------------------
# 24: View list of incoming chats escalated from chatbot
#     (pending / in_progress sessions with basic info)
# -------------------------------------------------------------------
@live_agent_bp.get("/sessions")
def list_sessions():
    """
    GET /support/sessions?status=pending|in_progress|closed
    Default: pending + in_progress
    """
    status = request.args.get("status")

    if status:
        statuses = [status]
    else:
        # default view: open chats
        statuses = ["pending", "in_progress"]

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
              s.id,
              s.customer_id,
              s.agent_id,
              s.status,
              s.resolution_tag,
              s.summary_email_sent,
              s.summary_email_sent_at,
              s.closed_at,
              s.ended_at,
              s.created_at,
              s.last_updated,
              s.notes,
              cu.email  AS customer_email,
              ag.email  AS agent_email
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            WHERE s.status = ANY(%s)
            ORDER BY s.last_updated DESC
            LIMIT 50;
            """,
            (statuses,),
        )
        rows = cur.fetchall()

    return ok(rows)


# -------------------------------------------------------------------
# 25 + 27: View single session & its messages (full history)
# -------------------------------------------------------------------
@live_agent_bp.get("/sessions/<session_id>")
def get_session(session_id):
    """
    GET /support/sessions/<session_id>
    Returns session info + ordered message history.
    """
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # session metadata
        cur.execute(
            """
            SELECT
              s.id,
              s.customer_id,
              s.agent_id,
              s.status,
              s.resolution_tag,
              s.summary_email_sent,
              s.summary_email_sent_at,
              s.closed_at,
              s.ended_at,
              s.created_at,
              s.last_updated,
              s.notes,
              s.rasa_sender_id,
              cu.email AS customer_email,
              ag.email AS agent_email
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            WHERE s.id = %s;
            """,
            (session_id,),
        )
        session = cur.fetchone()
        if not session:
            return error("Session not found", status=404)

        # message history
        cur.execute(
            """
            SELECT
              id,
              sender_role,
              sender_id,
              message,
              is_bot,
              created_at
            FROM chat_messages
            WHERE session_id = %s
            ORDER BY created_at ASC, id ASC;
            """,
            (session_id,),
        )
        messages = cur.fetchall()

    return ok({"session": session, "messages": messages})


# -------------------------------------------------------------------
# 26: Claim a session (mark as in_progress, assign agent)
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/<session_id>/claim")
def claim_session(session_id):
    """
    POST /support/sessions/<session_id>/claim
    body: { "agent_id": "<uuid>" }
    """
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")

    if not agent_id:
        return error("agent_id is required")

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # only allow claim if pending
        cur.execute(
            """
            UPDATE chat_sessions
            SET agent_id = %s,
                status = 'in_progress',
                last_updated = NOW()
            WHERE id = %s
              AND (status = 'pending' OR agent_id IS NULL)
            RETURNING *;
            """,
            (agent_id, session_id),
        )
        row = cur.fetchone()

        if not row:
            return error(
                "Session not found or already claimed by another agent", status=409
            )

        # fetch agent email for the acknowledgement
        agent_email = None
        if agent_id:
            cur.execute("SELECT email FROM app_user WHERE id = %s;", (agent_id,))
            agent_row = cur.fetchone()
            agent_email = agent_row.get("email") if agent_row else None

    # push a "connected" message back to the customer's chat (via Rasa REST channel)
    rasa_sender_id = row.get("rasa_sender_id")
    if rasa_sender_id:
        agent_name = agent_email or "a support agent"
        try:
            requests.post(
                RASA_RELAY_URL,
                json={
                    "sender": rasa_sender_id,
                    "message": f"You are now connected to {agent_name}.",
                },
                timeout=2,
            )
        except Exception as relay_err:
            print("WARN: failed to relay claim notice to Rasa:", relay_err)

    return ok(row)


# -------------------------------------------------------------------
# 27: Send real-time message from agent
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/<session_id>/messages")
def send_agent_message(session_id):
    """
    POST /support/sessions/<session_id>/messages
    body: { "agent_id": "<uuid>", "message": "text here" }
    """
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    message = data.get("message")

    if not agent_id or not message:
        return error("agent_id and message are required")

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            # verify session exists and capture rasa sender for push relay
            cur.execute(
                "SELECT id, rasa_sender_id FROM chat_sessions WHERE id = %s;",
                (session_id,),
            )
            session_row = cur.fetchone()
            if not session_row:
                return error("Session not found", status=404)
            rasa_sender_id = session_row.get("rasa_sender_id")

            # Try variant with sender_type column (if your table has it)
            try:
                cur.execute(
                    """
                    INSERT INTO chat_messages (
                      session_id,
                      sender_role,
                      sender_type,
                      sender_id,
                      message,
                      is_bot
                    )
                    VALUES (%s, 'agent', 'agent', %s, %s, FALSE)
                    RETURNING id, session_id, sender_role, sender_id, message, is_bot, created_at;
                    """,
                    (session_id, agent_id, message),
                )
            except psycopg2.errors.UndefinedColumn:
                # Table has no sender_type column → fallback to older schema
                conn.rollback()
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    """
                    INSERT INTO chat_messages (
                      session_id,
                      sender_role,
                      sender_id,
                      message,
                      is_bot
                    )
                    VALUES (%s, 'agent', %s, %s, FALSE)
                    RETURNING id, session_id, sender_role, sender_id, message, is_bot, created_at;
                    """,
                    (session_id, agent_id, message),
                )

            msg = cur.fetchone()

            # bump last_updated on session
            cur.execute(
                "UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;",
                (session_id,),
            )

        # Attempt to relay the agent message back into the user's chat via Rasa HTTP API
        if rasa_sender_id:
            push_url = RASA_PUSH_URL.replace("{sender_id}", rasa_sender_id)
            # Post a bot event directly to the tracker so it shows up in conversation history
            payload = {"event": "bot", "text": message, "metadata": {"source": "agent"}}
            try:
                requests.post(push_url, json=payload, timeout=6)
            except Exception as relay_err:
                print("WARN: failed to relay agent message to Rasa:", relay_err)

        return ok(msg)

    except Exception as e:
        print("ERROR send_agent_message:", e)
        return error(str(e), status=500)



# -------------------------------------------------------------------
# 29: End chat with resolution tag
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/<session_id>/resolve")
def resolve_session(session_id):
    """
    POST /support/sessions/<session_id>/resolve
    body: { "agent_id": "<uuid>", "resolution_tag": "Refund issued" }
    """
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    resolution_tag = data.get("resolution_tag", "")

    if not agent_id:
        return error("agent_id is required")

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # try to update resolution_tag if column exists
        try:
            cur.execute(
                """
                UPDATE chat_sessions
                SET status = 'closed',
                    last_updated = NOW(),
                    closed_at = NOW(),
                    ended_at = NOW(),
                    resolution_tag = COALESCE(%s, resolution_tag)
                WHERE id = %s
                RETURNING *;
                """,
                (resolution_tag, session_id),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                UPDATE chat_sessions
                SET status = 'closed',
                    last_updated = NOW(),
                    closed_at = NOW(),
                    ended_at = NOW()
                WHERE id = %s
                RETURNING *;
                """,
                (session_id,),
            )

        row = cur.fetchone()
        if not row:
            return error("Session not found", status=404)

        # fetch participant emails for summary
        cur.execute(
            """
            SELECT
              s.id, s.status, s.resolution_tag,
              cu.email AS customer_email,
              ag.email AS agent_email
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            WHERE s.id = %s;
            """,
            (session_id,),
        )
        session_meta = cur.fetchone() or {}

        # fetch messages for transcript
        cur.execute(
            """
            SELECT sender_role, sender_type, message, created_at
            FROM chat_messages
            WHERE session_id = %s
            ORDER BY created_at ASC, id ASC;
            """,
            (session_id,),
        )
        messages = cur.fetchall() or []

        email_body = format_chat_summary(session_meta, messages, resolution_tag)
        customer_email = session_meta.get("customer_email")
        email_sent = send_summary_email(
            customer_email,
            subject=f"Your support chat summary (Chat {session_id})",
            body=email_body,
        )

        # persist summary email metadata
        cur.execute(
            """
            UPDATE chat_sessions
            SET summary_email_sent = %s,
                summary_email_sent_at = CASE WHEN %s THEN NOW() ELSE summary_email_sent_at END,
                summary_email_to = %s,
                summary_email_body = %s
            WHERE id = %s;
            """,
            (email_sent, email_sent, customer_email, email_body, session_id),
        )

    return ok(row)


# -------------------------------------------------------------------
# 31: Flag questions the chatbot struggles with
# -------------------------------------------------------------------
@live_agent_bp.post("/sessions/<session_id>/flags")
def flag_question(session_id):
    """
    POST /support/sessions/<session_id>/flags
    body: {
      "agent_id": "<uuid>",
      "message_id": <bigint>,
      "reason": "Bot did not understand product compatibility question"
    }
    """
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    message_id = data.get("message_id")
    reason = data.get("reason")

    if not agent_id or not message_id or not reason:
        return error("agent_id, message_id and reason are required")

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # ensure session + message exist and belong together
        cur.execute(
            """
            SELECT 1
            FROM chat_messages
            WHERE id = %s AND session_id = %s;
            """,
            (message_id, session_id),
        )
        if not cur.fetchone():
            return error("Message not found for this session", status=404)

        # insert flag
        cur.execute(
            """
            INSERT INTO chat_flags (
              session_id,
              message_id,
              reason,
              flagged_by_agent_id
            )
            VALUES (%s, %s, %s, %s)
            RETURNING id, session_id, message_id, reason, flagged_by_agent_id, created_at;
            """,
            (session_id, message_id, reason, agent_id),
        )
        flag = cur.fetchone()

    return ok(flag)
