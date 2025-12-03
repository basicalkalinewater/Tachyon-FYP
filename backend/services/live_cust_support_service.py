import json
import os
import smtplib
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

import psycopg2
import requests
from flask import Response, jsonify, stream_with_context
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load configuration from repo root
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(env_path)

# Optional defaults when incoming handoff has no mapped IDs yet
FALLBACK_CUSTOMER_ID = os.getenv("LIVE_CUST_SUPPORT_FALLBACK_CUSTOMER_ID") or os.getenv(
    "LIVE_AGENT_FALLBACK_CUSTOMER_ID"
)
FALLBACK_AGENT_ID = os.getenv("LIVE_CUST_SUPPORT_FALLBACK_AGENT_ID") or os.getenv(
    "LIVE_AGENT_FALLBACK_AGENT_ID"
)

# Database credentials
DB_CONFIG = {
    "host": os.environ.get("DB_HOST"),
    "port": os.environ.get("DB_PORT", 5432),
    "dbname": os.environ.get("DB_NAME", "postgres"),
    "user": os.environ.get("DB_USER", "postgres"),
    "password": os.environ.get("DB_PASSWORD"),
}

# External integrations
RASA_RELAY_URL = os.getenv("RASA_RELAY_URL", "http://localhost:5005/webhooks/rest/webhook")
RASA_PUSH_URL = os.getenv("RASA_PUSH_URL", "http://localhost:5005/conversations/{sender_id}/tracker/events")
RASA_FORWARD_URL = os.getenv("RASA_FORWARD_URL", "http://localhost:4000/support/sessions/from_rasa/message")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER or "no-reply@example.com")

missing = [k for k, v in DB_CONFIG.items() if v in (None, "") and k != "sslmode"]
if missing:
    raise RuntimeError(f"Missing DB config values in .env: {', '.join(missing)}")


@contextmanager
def get_db():
    """Yield a Postgres connection with auto-commit/rollback."""
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ok(data=None):
    return jsonify({"success": True, "data": data})


def error(message, status=400):
    return jsonify({"success": False, "error": message}), status


def format_chat_summary(session_row, messages, resolution_tag):
    """Compose a plain-text summary email for a chat session."""
    lines = [
        "Hi,",
        "",
        "Here is a summary of your recent support chat:",
        f"- Chat ID: {session_row.get('id')}",
        f"- Status: {session_row.get('status')}",
    ]
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
    """Send a summary email; return True/False depending on success."""
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
    except Exception as exc:
        print("WARN: failed to send summary email:", exc)
        return False


def create_session_from_rasa(sender_id: str, last_message: str):
    """Create a new chat session when Rasa escalates to a human."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
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
                (FALLBACK_CUSTOMER_ID, FALLBACK_AGENT_ID, sender_id),
            )
            session_row = cur.fetchone()
            session_id = session_row["id"]

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
                (session_id, FALLBACK_CUSTOMER_ID, last_message),
            )
            message_row = cur.fetchone()

        return ok({"session_id": session_id, "first_message_id": message_row["id"], "note": "Session created from Rasa handoff"})
    except Exception as exc:
        print("ERROR create_session_from_rasa:", exc)
        return error(str(exc), status=500)


def append_message_from_rasa(sender_id: str, last_message: str):
    """Append a customer message to the latest open session for a sender."""
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
            customer_id = session["customer_id"] or FALLBACK_CUSTOMER_ID

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

            cur.execute("UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;", (session_id,))

        return ok({"session_id": session_id})
    except Exception as exc:
        print("ERROR append_message_from_rasa:", exc)
        return error(str(exc), status=500)


def send_customer_message(session_id: str, message: str, customer_id: Optional[str]):
    """Append a direct customer message to a session."""
    customer_id = customer_id or FALLBACK_CUSTOMER_ID
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

            cur.execute("UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;", (session_id,))

        return ok({"message_id": row["id"], "created_at": row["created_at"]})
    except Exception as exc:
        print("ERROR send_customer_message:", exc)
        return error(str(exc), status=500)


def stream_session(session_id: str):
    """Return an SSE Response that streams new messages for a session."""

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
            except Exception as exc:
                print("WARN: stream error:", exc)
            time.sleep(1)

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")


def list_sessions(status: Optional[str]):
    """List sessions; defaults to pending and in_progress."""
    if status:
        statuses = [status]
    else:
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
              ag.email  AS agent_email,
              cp.full_name  AS customer_full_name,
              coalesce(lap.full_name, ag.email) AS agent_full_name
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            LEFT JOIN customer_profile cp ON cp.user_id = s.customer_id
            LEFT JOIN live_agent_profile lap ON lap.user_id = s.agent_id
            WHERE s.status = ANY(%s)
            ORDER BY s.last_updated DESC
            LIMIT 50;
            """,
            (statuses,),
        )
        rows = cur.fetchall()

    return ok(rows)


def get_session(session_id: str):
    """Fetch a single session plus its ordered message history."""
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
              s.rasa_sender_id,
              cu.email AS customer_email,
              ag.email AS agent_email,
              cp.full_name  AS customer_full_name,
              coalesce(lap.full_name, ag.email) AS agent_full_name
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            LEFT JOIN customer_profile cp ON cp.user_id = s.customer_id
            LEFT JOIN live_agent_profile lap ON lap.user_id = s.agent_id
            WHERE s.id = %s;
            """,
            (session_id,),
        )
        session = cur.fetchone()
        if not session:
            return error("Session not found", status=404)

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


def claim_session(session_id: str, agent_id: str):
    """Assign a session to an agent and notify the user via Rasa if possible."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
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
            return error("Session not found or already claimed by another agent", status=409)

        agent_email = None
        if agent_id:
            cur.execute("SELECT email FROM app_user WHERE id = %s;", (agent_id,))
            agent_row = cur.fetchone()
            agent_email = agent_row.get("email") if agent_row else None

    rasa_sender_id = row.get("rasa_sender_id")
    if rasa_sender_id:
        agent_name = agent_email or "a support agent"
        try:
            requests.post(
                RASA_RELAY_URL,
                json={"sender": rasa_sender_id, "message": f"You are now connected to {agent_name}."},
                timeout=2,
            )
        except Exception as exc:
            print("WARN: failed to relay claim notice to Rasa:", exc)

    return ok(row)


def send_agent_message(session_id: str, agent_id: str, message: str):
    """Push a real-time agent message into a session and mirror it back to Rasa."""
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT id, rasa_sender_id FROM chat_sessions WHERE id = %s;", (session_id,))
            session_row = cur.fetchone()
            if not session_row:
                return error("Session not found", status=404)
            rasa_sender_id = session_row.get("rasa_sender_id")

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
            cur.execute("UPDATE chat_sessions SET last_updated = NOW() WHERE id = %s;", (session_id,))

        if rasa_sender_id:
            push_url = RASA_PUSH_URL.replace("{sender_id}", rasa_sender_id)
            payload = {"event": "bot", "text": message, "metadata": {"source": "agent"}}
            try:
                requests.post(push_url, json=payload, timeout=6)
            except Exception as exc:
                print("WARN: failed to relay agent message to Rasa:", exc)

        return ok(msg)
    except Exception as exc:
        print("ERROR send_agent_message:", exc)
        return error(str(exc), status=500)


def resolve_session(session_id: str, agent_id: str, resolution_tag: str):
    """Close a session with a resolution tag and email a summary to the customer."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
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

        cur.execute(
            """
            SELECT
              s.id, s.status, s.resolution_tag,
              cu.email AS customer_email,
              ag.email AS agent_email,
              cp.full_name  AS customer_full_name,
              coalesce(lap.full_name, ag.email) AS agent_full_name
            FROM chat_sessions s
            LEFT JOIN app_user cu ON cu.id = s.customer_id
            LEFT JOIN app_user ag ON ag.id = s.agent_id
            LEFT JOIN customer_profile cp ON cp.user_id = s.customer_id
            LEFT JOIN live_agent_profile lap ON lap.user_id = s.agent_id
            WHERE s.id = %s;
            """,
            (session_id,),
        )
        session_meta = cur.fetchone() or {}

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


def flag_question(session_id: str, agent_id: str, message_id, reason: str):
    """Flag a message the bot struggled with for follow-up analysis."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
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
