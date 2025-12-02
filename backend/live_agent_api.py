import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Blueprint, jsonify, request
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
              s.created_at,
              s.last_updated,
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
              s.created_at,
              s.last_updated,
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

            # verify session exists
            cur.execute(
                "SELECT id FROM chat_sessions WHERE id = %s;",
                (session_id,),
            )
            if not cur.fetchone():
                return error("Session not found", status=404)

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
                    closed_at = NOW()
                WHERE id = %s
                RETURNING *;
                """,
                (session_id,),
            )

        row = cur.fetchone()
        if not row:
            return error("Session not found", status=404)

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
