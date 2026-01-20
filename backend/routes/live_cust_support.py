import json
import time
from flask import Blueprint, request

try:
    from ..services import live_cust_support_service as service  # package import (backend.<module>)
    from ..utils.auth_middleware import require_session
    from ..schemas.support import RasaHandoffPayload, CSATPayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
    from ..services import session_service
    from ..ws import sock
except ImportError:
    from services import live_cust_support_service as service  # fallback for top-level import
    from utils.auth_middleware import require_session
    from schemas.support import RasaHandoffPayload, CSATPayload
    from schemas.base import validate_body
    from limiter import maybe_limit
    from services import session_service
    from ws import sock
from flask import current_app, g, jsonify

print("[ws] live_cust_support routes loaded")

# Blueprint for live customer support chat; mounted under /support
live_cust_support_bp = Blueprint("live_cust_support", __name__)

@sock.route("/support/sessions/<session_id>/ws")
def stream_session_ws(ws, session_id):
    """WebSocket stream of new messages for a session."""
    try:
        print(f"[ws] connect attempt session={session_id}")
        # Auth via session token (query param; browsers can't set WS headers).
        token = (request.args.get("token") or request.args.get("sessionToken") or "").strip()
        if not token:
            print(f"[ws] missing token for session {session_id}")
            ws.close(code=1008, reason="missing token")
            return

        supabase = current_app.config["SUPABASE"]
        session_row, err = session_service.get_session(supabase, token)
        if err or not session_row:
            print(f"[ws] invalid session for {session_id}: {err}")
            ws.close(code=1008, reason="invalid session")
            return

        user_id = session_row.get("user_id")
        try:
            res = supabase.table("app_user").select("role").eq("id", user_id).single().execute()
            role = (res.data or {}).get("role")
        except Exception as exc:
            print(f"[ws] user lookup failed for {session_id}: {exc}")
            role = None
        if role not in ("support", "admin"):
            print(f"[ws] forbidden role for {session_id}: {role}")
            ws.close(code=1008, reason="forbidden role")
            return
        print(f"[ws] connected session={session_id} role={role}")
    except Exception as exc:
        print(f"[ws] exception during handshake for {session_id}: {exc}")
        try:
            ws.close(code=1011, reason="server error")
        except Exception:
            pass
        return

    last_id = 0
    while True:
        try:
            rows = service.fetch_messages_since(session_id, last_id)
            if rows:
                last_id = rows[-1]["id"]
                ws.send(json.dumps(rows, default=str))
            time.sleep(0.35)
        except Exception:
            # Client disconnected or send failed.
            break


@live_cust_support_bp.post("/sessions/from_rasa")
@maybe_limit("30 per minute")
def create_session_from_rasa():
    # Create a new session when Rasa hands off to a human
    data, error = validate_body(RasaHandoffPayload)
    if error:
        return error
    return service.create_session_from_rasa(data.sender_id, data.last_message, data.customer_id)


@live_cust_support_bp.post("/sessions/from_rasa/message")
@maybe_limit("60 per minute")
def append_message_from_rasa():
    # Append a customer message to the latest open session for a sender
    data, error = validate_body(RasaHandoffPayload)
    if error:
        return error
    return service.append_message_from_rasa(data.sender_id, data.last_message)


@live_cust_support_bp.post("/sessions/<session_id>/customer/messages")
@maybe_limit("60 per minute")
def send_customer_message(session_id):
    # Direct customer message to a session (bypasses Rasa)
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message")
    customer_id = data.get("customer_id")
    if not message:
        return service.error("message is required")
    return service.send_customer_message(session_id, message, customer_id)


@live_cust_support_bp.get("/queue/<sender_id>")
@maybe_limit("120 per minute")
def get_queue_status(sender_id):
    # Return queue position/status for a Rasa sender_id
    return service.queue_status(sender_id)


@live_cust_support_bp.get("/sessions")
@require_session(allowed_roles=["support", "admin"])
def list_sessions():
    # List sessions (defaults to pending + in_progress)
    status = request.args.get("status")
    return service.list_sessions(status)


@live_cust_support_bp.get("/sessions/<session_id>")
@require_session(allowed_roles=["support", "admin"])
def get_session(session_id):
    # Fetch one session plus its messages
    limit = request.args.get("limit", 200)
    return service.get_session(session_id, limit)


@live_cust_support_bp.get("/sessions_public/<session_id>")
def get_session_public(session_id):
    """
    Public read-only endpoint used by the customer widget to poll session + messages.
    """
    limit = request.args.get("limit", 200)
    return service.get_session(session_id, limit)


@live_cust_support_bp.post("/sessions/<session_id>/claim")
@require_session(allowed_roles=["support"])
def claim_session(session_id):
    # Claim a session for an agent and notify the user
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    if not agent_id:
        return service.error("agent_id is required")
    return service.claim_session(session_id, agent_id)


@live_cust_support_bp.post("/sessions/<session_id>/messages")
@require_session(allowed_roles=["support"])
@maybe_limit("120 per minute")
def send_agent_message(session_id):
    # Send a live agent message and mirror it to Rasa
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    message = data.get("message")
    if not agent_id or not message:
        return service.error("agent_id and message are required")
    return service.send_agent_message(session_id, agent_id, message)


@live_cust_support_bp.post("/sessions/<session_id>/resolve")
@require_session(allowed_roles=["support"])
def resolve_session(session_id):
    # Close a session and send a summary email if configured
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    resolution_tag = data.get("resolution_tag", "")
    if not agent_id:
        return service.error("agent_id is required")
    return service.resolve_session(session_id, agent_id, resolution_tag)


@live_cust_support_bp.post("/sessions/<session_id>/flags")
@require_session(allowed_roles=["support"])
def flag_question(session_id):
    # Flag a message the bot struggled with for follow-up
    data = request.get_json(force=True, silent=True) or {}
    agent_id = data.get("agent_id")
    message_id = data.get("message_id")
    reason = data.get("reason")
    if not agent_id or not message_id or not reason:
        return service.error("agent_id, message_id and reason are required")
    return service.flag_question(session_id, agent_id, message_id, reason)


@live_cust_support_bp.post("/sessions/<session_id>/csat")
@maybe_limit("20 per minute")
def submit_csat(session_id):
    """Public CSAT submission endpoint (can be called by Rasa or email link)."""
    data, error = validate_body(CSATPayload)
    if error:
        return error
    token = request.args.get("token")  # reserved for future signed links
    return service.submit_csat(session_id, data.rating, data.feedback, token)


@live_cust_support_bp.post("/sessions/from_rasa/csat")
@maybe_limit("30 per minute")
def submit_csat_from_rasa():
    """Rasa webhook: expects sender_id and rating (1-5), optional feedback."""
    data, error = validate_body(CSATPayload)
    if error:
        return error
    sender_id = data.sender_id or ""
    if not sender_id:
        return service.error("sender_id is required")
    return service.submit_csat_from_rasa(sender_id, data.rating, data.feedback)


@live_cust_support_bp.post("/guest/escalate")
def guest_escalate():
    """Public endpoint: collect guest name/email, create ticket+session, return ids."""
    data = request.get_json(force=True, silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    last_message = (data.get("last_message") or "").strip() or "Need a human agent"
    sender_id = (data.get("sender_id") or "").strip()
    if not full_name or not email:
        return service.error("full_name and email are required", status=400)
    return service.create_guest_ticket(full_name=full_name, email=email, sender_id=sender_id, last_message=last_message)


@live_cust_support_bp.get("/csat/summary")
@require_session(allowed_roles=["admin", "support"])
@maybe_limit("120 per minute")
def csat_summary():
    window_days = int(request.args.get("window_days", 30))
    agent_id = request.args.get("agent_id")
    return service.get_csat_summary(window_days, agent_id)


@live_cust_support_bp.get("/csat/responses")
@require_session(allowed_roles=["admin", "support"])
@maybe_limit("120 per minute")
def csat_responses():
    limit = int(request.args.get("limit", 50))
    return service.list_csat_responses(limit)


@live_cust_support_bp.get("/profile")
@require_session(allowed_roles=["support"])
def get_agent_profile():
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    data = service.fetch_agent_profile(supabase, user_id) or {}
    return jsonify({"success": True, "data": {"full_name": data.get("full_name") or "", "phone": data.get("phone") or ""}})


@live_cust_support_bp.put("/profile")
@require_session(allowed_roles=["support"])
def update_agent_profile():
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user["id"]
    payload = request.get_json(force=True, silent=True) or {}
    full_name = (payload.get("full_name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    try:
        service.upsert_agent_profile(supabase, user_id, full_name, phone)
        return jsonify({"success": True, "data": {"full_name": full_name, "phone": phone}})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
