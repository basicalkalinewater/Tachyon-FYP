import json
import os
import smtplib
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import threading
import uuid

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
AVERAGE_HANDLE_SECONDS = int(os.getenv("LIVE_AGENT_AVG_HANDLE_SECONDS", "120"))
CSAT_PROMPT = os.getenv("CSAT_PROMPT", "Please rate your support experience from 1-5 (5 = excellent). You can reply with a number and an optional comment.")

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


def fetch_agent_profile(supabase, user_id: str):
    """Fetch agent profile (full_name, phone) from live_agent_profile."""
    try:
        res = (
            supabase.table("live_agent_profile")
            .select("full_name, phone")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return res.data or {}
    except Exception:
        return {}


def upsert_agent_profile(supabase, user_id: str, full_name: str, phone: str):
    upsert_body = {"user_id": user_id, "full_name": full_name, "phone": phone}
    supabase.table("live_agent_profile").upsert(upsert_body).execute()


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


def _ticket_number_from_id(session_id):
    """Generate a readable ticket number from uuid/int session id."""
    text = str(session_id)
    compact = text.replace("-", "")
    return f"TCK-{compact[:8].upper()}"


def upsert_guest_user(full_name: str, email: str) -> str:
    """Create or reuse a guest (customer role) user and profile."""
    password_placeholder = uuid.uuid4().hex
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM app_user WHERE email = %s;", (email,))
        row = cur.fetchone()
        if row:
            user_id = row["id"]
        else:
            cur.execute(
                """
                INSERT INTO app_user (email, password_hash, role)
                VALUES (%s, %s, 'customer')
                ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
                RETURNING id;
                """,
                (email, password_placeholder),
            )
            user_id = cur.fetchone()["id"]

        cur.execute(
            """
            INSERT INTO customer_profile (user_id, full_name)
            VALUES (%s, %s)
            ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;
            """,
            (user_id, full_name),
        )
    return user_id


def create_guest_ticket(full_name: str, email: str, sender_id: str, last_message: str):
    """Create a ticket/session for a guest after collecting their info."""
    try:
        customer_id = upsert_guest_user(full_name, email)
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                INSERT INTO chat_sessions (
                    customer_id,
                    agent_id,
                    status,
                    rasa_sender_id,
                    subject,
                    priority,
                    last_updated
                )
                VALUES (%s, %s, 'pending', %s, %s, 'medium', NOW())
                RETURNING id;
                """,
                (customer_id, FALLBACK_AGENT_ID, sender_id or None, f"Guest: {full_name}",),
            )
            session_row = cur.fetchone()
            session_id = session_row["id"]

            ticket_number = _ticket_number_from_id(session_id)
            cur.execute(
                """
                UPDATE chat_sessions
                SET ticket_number = %s
                WHERE id = %s;
                """,
                (ticket_number, session_id),
            )

            if last_message:
                cur.execute(
                    """
                    INSERT INTO chat_messages (
                        session_id,
                        sender_role,
                        sender_id,
                        message,
                        is_bot
                    )
                    VALUES (%s, 'customer', %s, %s, FALSE);
                    """,
                    (session_id, customer_id, last_message),
                )

        return ok({"session_id": session_id, "ticket_number": ticket_number})
    except Exception as exc:
        print("ERROR create_guest_ticket:", exc)
        return error(str(exc), status=500)


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

            # Generate a deterministic ticket number from the session id
            ticket_number = _ticket_number_from_id(session_id)
            cur.execute(
                """
                UPDATE chat_sessions
                SET ticket_number = %s,
                    subject = COALESCE(subject, 'Escalated chat'),
                    priority = COALESCE(priority, 'medium')
                WHERE id = %s;
                """,
                (ticket_number, session_id),
            )

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

        return ok({"session_id": session_id, "ticket_number": ticket_number, "first_message_id": message_row["id"], "note": "Session created from Rasa handoff"})
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
                SELECT id, customer_id, status
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
                print(f"[rasa_append] no open session for sender_id={sender_id}")
                return error("No open session for this sender", status=404)

            session_id = session["id"]
            customer_id = session["customer_id"] or FALLBACK_CUSTOMER_ID
            if session.get("status") != "in_progress":
                print(f"[rasa_append] session {session_id} status={session.get('status')} not in_progress")
                return error("Waiting for an agent to claim this chat", status=409)

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
                return error("Session not found or closed", status=409)

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
              s.ticket_number,
              s.subject,
              s.priority,
              s.closed_at,
              s.ended_at,
              s.created_at,
              s.last_updated,
              s.notes,
              CASE
                WHEN s.status = 'pending'
                  THEN row_number() OVER (PARTITION BY s.status ORDER BY s.last_updated ASC)
                ELSE NULL
              END AS queue_position,
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


def _normalize_limit(limit: Optional[int], default: int = 200, max_limit: int = 1000, min_limit: int = 50) -> int:
    try:
        val = int(limit)
    except Exception:
        val = default
    return max(min_limit, min(val, max_limit))


def get_session(session_id: str, limit: Optional[int] = 200):
    """Fetch a single session plus its ordered (oldest->newest) message history."""
    limit = _normalize_limit(limit)
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
              s.ticket_number,
              s.subject,
              s.priority,
              s.closed_at,
              s.ended_at,
              s.created_at,
              s.last_updated,
              s.notes,
              s.rasa_sender_id,
              CASE
                WHEN s.status = 'pending'
                  THEN row_number() OVER (PARTITION BY s.status ORDER BY s.last_updated ASC)
                ELSE NULL
              END AS queue_position,
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
            ORDER BY id DESC
            LIMIT %s;
            """,
            (session_id, limit),
        )
        messages_desc = cur.fetchall() or []
        messages = list(reversed(messages_desc))

    return ok({"session": session, "messages": messages})


def claim_session(session_id: str, agent_id: str):
    """Assign a session to an agent and notify the user via Rasa if possible."""
    print(f"[claim] attempting claim session_id={session_id} agent_id={agent_id}")
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            UPDATE chat_sessions
            SET agent_id = %s,
                status = 'in_progress',
                last_updated = NOW(),
                claimed_at = NOW()
            WHERE id = %s
              AND (status = 'pending' OR agent_id IS NULL)
            RETURNING *;
            """,
            (agent_id, session_id),
        )
        row = cur.fetchone()
        if not row:
            print(f"[claim] failed (not found or already claimed) session_id={session_id}")
            return error("Session not found or already claimed by another agent", status=409)
        else:
            print(f"[claim] success session_id={session_id} status={row.get('status')} agent_id={agent_id}")

        agent_email = None
        if agent_id:
            cur.execute("SELECT email FROM app_user WHERE id = %s;", (agent_id,))
            agent_row = cur.fetchone()
            agent_email = agent_row.get("email") if agent_row else None

        try:
            cur.execute(
                """
                INSERT INTO chat_messages (
                  session_id,
                  sender_role,
                  sender_type,
                  message,
                  is_bot
                )
                VALUES (%s, 'system', 'system', %s, TRUE)
                RETURNING id, session_id, sender_role, sender_type, message, created_at;
                """,
                (
                    session_id,
                    "You are now connected to a support agent.",
                ),
            )
        except Exception as exc:
            print("WARN: failed to append claim notice to chat:", exc)

    rasa_sender_id = row.get("rasa_sender_id")
    if rasa_sender_id:
        agent_name = agent_email or "a support agent"
        push_url = RASA_PUSH_URL.replace("{sender_id}", rasa_sender_id)
        payload = {"event": "bot", "text": f"You are now connected to {agent_name}.", "metadata": {"source": "system"}}
        try:
            requests.post(push_url, json=payload, timeout=3)
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
    close_notice = "This chat has been closed."
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
                    resolution_tag = NULLIF(%s, '')::text
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

        try:
            cur.execute(
                """
                INSERT INTO chat_messages (
                  session_id,
                  sender_role,
                  sender_type,
                  message,
                  is_bot
                )
                VALUES (%s, 'system', 'system', %s, TRUE);
                """,
                (
                    session_id,
                    close_notice,
                ),
            )
        except Exception as exc:
            print("WARN: failed to append close notice to chat:", exc)

        # Also log the CSAT prompt as a system message so the web widget can render it
        try:
            cur.execute(
                """
                INSERT INTO chat_messages (
                  session_id,
                  sender_role,
                  sender_type,
                  message,
                  is_bot
                )
                VALUES (%s, 'system', 'system', %s, TRUE);
                """,
                (
                    session_id,
                    CSAT_PROMPT,
                ),
            )
        except Exception as exc:
            print("WARN: failed to append CSAT prompt to chat:", exc)

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

    rasa_sender_id = session_meta.get("rasa_sender_id") if isinstance(session_meta, dict) else None
    if rasa_sender_id:
        push_url = RASA_PUSH_URL.replace("{sender_id}", rasa_sender_id)
        payload = {
            "event": "bot",
            "text": close_notice,
            "metadata": {"source": "system"},
        }
        try:
            requests.post(push_url, json=payload, timeout=3)
        except Exception as exc:
            print("WARN: failed to relay close notice to Rasa:", exc)
        # Reset handoff slot so future bot messages aren't forwarded
        try:
            requests.post(
                push_url,
                json={"event": "slot", "name": "handoff_active", "value": False},
                timeout=3,
            )
        except Exception as exc:
            print("WARN: failed to reset handoff slot:", exc)
        # Follow-up CSAT prompt
        csat_payload = {
            "event": "bot",
            "text": CSAT_PROMPT,
            "metadata": {"source": "system", "csat_session_id": session_id},
        }
        try:
            requests.post(push_url, json=csat_payload, timeout=3)
        except Exception as exc:
            print("WARN: failed to send CSAT prompt to Rasa:", exc)
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


def submit_csat(session_id: str, rating: int, feedback: Optional[str], token: Optional[str]):
    """Store CSAT rating for a session; ignore token for now (reserved for signed links)."""
    try:
        rating_int = int(rating)
    except Exception:
        return error("rating must be an integer between 1 and 5")
    if rating_int < 1 or rating_int > 5:
        return error("rating must be between 1 and 5")
    feedback_text = (feedback or "").strip()

    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT customer_rating FROM chat_sessions WHERE id = %s;", (session_id,))
            existing = cur.fetchone()
            if not existing:
                return error("Session not found", 404)
            if existing.get("customer_rating") is not None:
                return error("CSAT already submitted", 409)

            cur.execute(
                """
                UPDATE chat_sessions
                   SET customer_rating = %s,
                       customer_feedback = NULLIF(%s, ''),
                       customer_rating_submitted_at = NOW(),
                       last_updated = NOW()
                 WHERE id = %s
                RETURNING id, customer_rating, customer_feedback, customer_rating_submitted_at;
                """,
                (rating_int, feedback_text, session_id),
            )
            updated = cur.fetchone()

        _refresh_csat_rollup_async()
        return ok(updated)
    except Exception as exc:
        print("ERROR submit_csat:", exc)
        return error(str(exc), 500)


def _find_latest_session_for_sender(sender_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT id, status
            FROM chat_sessions
            WHERE rasa_sender_id = %s
            ORDER BY last_updated DESC
            LIMIT 1;
            """,
            (sender_id,),
        )
        return cur.fetchone()


def submit_csat_from_rasa(sender_id: str, rating: int, feedback: Optional[str]):
    """Allow Rasa bot to forward CSAT responses from the user."""
    session = _find_latest_session_for_sender(sender_id)
    if not session:
        return error("No session found for this sender", 404)
    return submit_csat(session["id"], rating, feedback, token=None)


def _refresh_csat_rollup_async():
    """Best-effort refresh of the materialized view without blocking the request."""

    def _do_refresh():
        try:
            with get_db() as conn:
                cur = conn.cursor()
                try:
                    cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY public.chat_csat_rollup;")
                except Exception:
                    conn.rollback()
                    cur = conn.cursor()
                    cur.execute("REFRESH MATERIALIZED VIEW IF EXISTS public.chat_csat_rollup;")
        except Exception as exc:
            print("WARN: refresh csat rollup failed:", exc)

    threading.Thread(target=_do_refresh, daemon=True).start()


def get_csat_summary(window_days: int, agent_id: Optional[str]):
    params = [window_days]
    agent_clause = ""
    if agent_id:
        agent_clause = "AND cs.agent_id = %s"
        params.append(agent_id)

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                f"""
                SELECT
                  COUNT(*)                               AS responses,
                  AVG(cs.customer_rating)::numeric(3,2)  AS avg_rating,
                  SUM(CASE WHEN cs.customer_rating >= 4 THEN 1 ELSE 0 END)::numeric /
                    NULLIF(COUNT(*), 0) * 100           AS csat_pct
                FROM chat_sessions cs
                WHERE cs.customer_rating IS NOT NULL
                  AND COALESCE(cs.closed_at, cs.created_at) >= NOW() - (%s || ' days')::interval
                  {agent_clause};
                """,
                params,
            )
            summary = cur.fetchone() or {}
        except Exception as exc:
            print("ERROR csat summary query:", exc)
            summary = {}

        try:
            cur.execute(
                f"""
                SELECT day, agent_id, avg_rating, csat_pct, responses
                FROM chat_csat_rollup
                WHERE day >= date_trunc('day', now() - (%s || ' days')::interval)
                  {agent_clause}
                ORDER BY day ASC;
                """,
                params,
            )
            trend = cur.fetchall() or []
        except Exception as exc:
            print("WARN: csat trend query failed (maybe MV missing):", exc)
            trend = []

        cur.execute(
            """
            SELECT
              cs.id as session_id,
              cs.agent_id,
              cs.customer_rating,
              cs.customer_feedback,
              cs.customer_rating_submitted_at
            FROM chat_sessions cs
            WHERE cs.customer_rating IS NOT NULL
            ORDER BY cs.customer_rating_submitted_at DESC
            LIMIT 20;
            """
        )
        verbatim = cur.fetchall() or []

    return ok({"summary": summary, "trend": trend, "verbatim": verbatim})


def list_csat_responses(limit: int = 50):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
              cs.id as session_id,
              cs.agent_id,
              cs.customer_rating,
              cs.customer_feedback,
              cs.customer_rating_submitted_at
            FROM chat_sessions cs
            WHERE cs.customer_rating IS NOT NULL
            ORDER BY cs.customer_rating_submitted_at DESC
            LIMIT %s;
            """,
            (limit,),
        )
        rows = cur.fetchall() or []
    return ok(rows)


def queue_status(rasa_sender_id: str):
    """Return queue position and status for a sender_id."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT id, status
            FROM chat_sessions
            WHERE rasa_sender_id = %s
              AND status IN ('pending', 'in_progress')
            ORDER BY last_updated DESC
            LIMIT 1;
            """,
            (rasa_sender_id,),
        )
        session = cur.fetchone()
        if not session:
            return error("No active session for this sender", status=404)

        if session["status"] == "in_progress":
            return ok(
                {
                    "session_id": session["id"],
                    "status": "in_progress",
                    "position": 0,
                    "estimated_wait_seconds": 0,
                }
            )

        cur.execute(
            """
            WITH ordered AS (
              SELECT id,
                     row_number() OVER (ORDER BY last_updated ASC) AS position,
                     count(*) OVER () AS total
              FROM chat_sessions
              WHERE status = 'pending'
            )
            SELECT id, position, total
            FROM ordered
            WHERE id = %s;
            """,
            (session["id"],),
        )
        row = cur.fetchone()
        if not row:
            return error("Session not in queue", status=404)

        position = row["position"]
        estimated_wait = max(position - 1, 0) * AVERAGE_HANDLE_SECONDS

        return ok(
            {
                "session_id": session["id"],
                "status": "pending",
                "position": position,
                "queue_size": row["total"],
                "estimated_wait_seconds": estimated_wait,
            }
        )

def submit_csat(session_id: str, rating: int, feedback: str, token: Optional[str]):
    if rating is None or not (1 <= int(rating) <= 5):
        return error("rating must be 1-5")
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            # prevent double submissions
            cur.execute(
                "select customer_rating from chat_sessions where id = %s;",
                (session_id,),
            )
            row = cur.fetchone()
            if not row:
                return error("Session not found", 404)
            if row.get("customer_rating") is not None:
                return error("CSAT already submitted", 409)

            cur.execute(
                """
                update chat_sessions
                   set customer_rating = %s,
                       customer_feedback = nullif(%s, ''),
                       customer_rating_submitted_at = now(),
                       last_updated = now()
                 where id = %s
                returning id, customer_rating, customer_feedback, customer_rating_submitted_at;
                """,
                (int(rating), feedback, session_id),
            )
            updated = cur.fetchone()
        # refresh rollup asynchronously in real deployment; synchronous for now
        try:
            with get_db() as conn:
                conn.cursor().execute("refresh materialized view public.chat_csat_rollup;")
        except Exception as exc:
            print("WARN: refresh csat rollup failed:", exc)
        return ok(updated)
    except Exception as exc:
        print("ERROR submit_csat:", exc)
        return error(str(exc), 500)


def get_csat_summary(window_days: int, agent_id: Optional[str]):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        params = [window_days]
        agent_clause = ""
        if agent_id:
            agent_clause = "and cs.agent_id = %s"
            params.append(agent_id)

        cur.execute(
            f"""
            select
              count(*)                               as responses,
              avg(cs.customer_rating)::numeric(3,2)  as avg_rating,
              sum(case when cs.customer_rating >= 4 then 1 else 0 end)::numeric /
                nullif(count(*),0) * 100             as csat_pct
            from chat_sessions cs
            where cs.customer_rating is not null
              and cs.closed_at >= now() - (%s || ' days')::interval
              {agent_clause};
            """,
            params,
        )
        summary = cur.fetchone() or {}

        cur.execute(
            f"""
            select day, agent_id, avg_rating, csat_pct, responses
            from chat_csat_rollup
            where day >= date_trunc('day', now() - (%s || ' days')::interval)
              {agent_clause}
            order by day asc;
            """,
            params,
        )
        trend = cur.fetchall() or []

        cur.execute(
            """
            select
              cs.id as session_id,
              cs.agent_id,
              cs.customer_rating,
              cs.customer_feedback,
              cs.customer_rating_submitted_at,
              coalesce(cp.full_name, cu.email, cs.rasa_sender_id, 'Guest') as customer_name,
              coalesce(cu.email, cs.rasa_sender_id, 'N/A') as customer_email
            from chat_sessions cs
            left join app_user cu on cu.id = cs.customer_id
            left join customer_profile cp on cp.user_id = cs.customer_id
            where cs.customer_rating is not null
            order by cs.customer_rating_submitted_at desc
            limit 20;
            """
        )
        verbatim = cur.fetchall() or []

    return ok({"summary": summary, "trend": trend, "verbatim": verbatim})


def list_csat_responses(limit: int = 50):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            select
              cs.id as session_id,
              cs.agent_id,
              cs.customer_rating,
              cs.customer_feedback,
              cs.customer_rating_submitted_at,
              coalesce(cp.full_name, cu.email, cs.rasa_sender_id, 'Guest') as customer_name,
              coalesce(cu.email, cs.rasa_sender_id, 'N/A') as customer_email
            from chat_sessions cs
            left join app_user cu on cu.id = cs.customer_id
            left join customer_profile cp on cp.user_id = cs.customer_id
            where cs.customer_rating is not null
            order by cs.customer_rating_submitted_at desc
            limit %s;
            """,
            (limit,),
        )
        rows = cur.fetchall() or []
    return ok(rows)
