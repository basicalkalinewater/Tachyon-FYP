import json
import os
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


# Blueprint for live customer support chat; mounted under /support
live_cust_support_bp = Blueprint("live_cust_support", __name__)


def _require_rasa_secret():
    """
    Optional shared-secret guard for Rasa/webhook-facing endpoints.
    Reject when secret is missing or invalid to prevent public abuse.
    """
    expected = (os.getenv("RASA_WEBHOOK_SECRET") or "").strip()
    if not expected:
        return service.error("Rasa webhook secret is not configured", status=503)
    provided = (request.headers.get("X-Rasa-Secret") or request.headers.get("X-Webhook-Secret") or "").strip()
    if provided != expected:
        return service.error("Forbidden", status=403)
    return None

@sock.route("/support/sessions/<session_id>/ws")
def stream_session_ws(ws, session_id):
    """WebSocket stream of new messages for a session."""
    current_app.logger.info("[ws] connect attempt session_id=%s", session_id)
    try:
        # Prefer auth payload over URL query params to avoid token leakage in logs/history.
        token = ""

        # Legacy fallback for older clients.
        token = (request.args.get("token") or request.args.get("sessionToken") or "").strip()

        if not token:
            raw = None
            try:
                raw = ws.receive(timeout=5)
            except TypeError:
                # Some WS backends may not support timeout kwarg.
                raw = None
            except Exception:
                raw = None

            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="ignore")

            if isinstance(raw, str) and raw.strip():
                try:
                    payload = json.loads(raw)
                    if isinstance(payload, dict):
                        token = (payload.get("token") or "").strip()
                except Exception:
                    token = ""

        if not token:
            current_app.logger.warning("[ws] missing token session_id=%s", session_id)
            ws.close(code=1008, reason="missing token")
            return

        supabase = current_app.config["SUPABASE"]
        session_row, err = session_service.get_session(supabase, token)
        if err or not session_row:
            current_app.logger.warning("[ws] invalid session session_id=%s err=%s", session_id, err)
            ws.close(code=1008, reason="invalid session")
            return

        user_id = session_row.get("user_id")
        try:
            res = supabase.table("app_user").select("role").eq("id", user_id).single().execute()
            role = (res.data or {}).get("role")
        except Exception as exc:
            role = None
        if role not in ("support", "admin"):
            current_app.logger.warning("[ws] forbidden role=%s session_id=%s", role, session_id)
            ws.close(code=1008, reason="forbidden role")
            return
        current_app.logger.info("[ws] connected session_id=%s role=%s", session_id, role)
    except Exception as exc:
        current_app.logger.exception("[ws] handshake error session_id=%s", session_id)
        try:
            ws.close(code=1011, reason="server error")
        except Exception:
            pass
        return

    last_id = 0
    idle_loops = 0
    while True:
        try:
            rows = service.fetch_messages_since(session_id, last_id)
            if rows:
                last_id = rows[-1]["id"]
                ws.send(json.dumps(rows, default=str))
                idle_loops = 0
                # Stay responsive while chat is active.
                time.sleep(0.1)
                continue

            # Back off while idle to reduce DB load.
            idle_loops = min(idle_loops + 1, 20)
            sleep_s = min(0.5, 0.12 + (idle_loops * 0.02))
            time.sleep(sleep_s)
        except Exception:
            # Client disconnected or send failed.
            current_app.logger.info("[ws] disconnected session_id=%s", session_id)
            break


@live_cust_support_bp.post("/sessions/from_rasa")
@maybe_limit("30 per minute")
def create_session_from_rasa():
    # Create a new session when Rasa hands off to a human
    guard = _require_rasa_secret()
    if guard:
        return guard
    data, error = validate_body(RasaHandoffPayload)
    if error:
        return error
    return service.create_session_from_rasa(data.sender_id, data.last_message, data.customer_id)


@live_cust_support_bp.post("/sessions/from_rasa/message")
@maybe_limit("60 per minute")
def append_message_from_rasa():
    # Append a customer message to the latest open session for a sender
    guard = _require_rasa_secret()
    if guard:
        return guard
    data, error = validate_body(RasaHandoffPayload)
    if error:
        return error
    return service.append_message_from_rasa(data.sender_id, data.last_message)


@live_cust_support_bp.post("/sessions/<session_id>/customer/messages")
@require_session(allowed_roles=["customer"])
@maybe_limit("60 per minute")
def send_customer_message(session_id):
    # Direct customer message to a session (authenticated customer-owned session only)
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message")
    customer_id = g.current_user["id"]
    if not message:
        return service.error("message is required")
    return service.send_customer_message(session_id, message, customer_id)


@live_cust_support_bp.get("/queue/<sender_id>")
@require_session(allowed_roles=["customer"], match_user_param="sender_id")
@maybe_limit("120 per minute")
def get_queue_status(sender_id):
    # Return queue position/status for the authenticated customer.
    return service.queue_status_for_customer(g.current_user["id"])


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
@require_session(allowed_roles=["customer"])
def get_session_public(session_id):
    """
    Customer read-only endpoint used by the widget to poll session + messages.
    """
    limit = request.args.get("limit", 200)
    return service.get_session_for_customer(session_id, g.current_user["id"], limit)


@live_cust_support_bp.post("/sessions/<session_id>/claim")
@require_session(allowed_roles=["support"])
def claim_session(session_id):
    # Claim a session for an agent and notify the user
    agent_id = g.current_user["id"]
    return service.claim_session(session_id, agent_id)


@live_cust_support_bp.post("/sessions/<session_id>/messages")
@require_session(allowed_roles=["support"])
@maybe_limit("120 per minute")
def send_agent_message(session_id):
    # Send a live agent message and mirror it to Rasa
    data = request.get_json(force=True, silent=True) or {}
    agent_id = g.current_user["id"]
    message = data.get("message")
    if not message:
        return service.error("message is required")
    return service.send_agent_message(session_id, agent_id, message)


@live_cust_support_bp.post("/sessions/<session_id>/resolve")
@require_session(allowed_roles=["support"])
def resolve_session(session_id):
    # Close a session with a resolution tag
    data = request.get_json(force=True, silent=True) or {}
    agent_id = g.current_user["id"]
    resolution_tag = data.get("resolution_tag", "")
    return service.resolve_session(session_id, agent_id, resolution_tag)


@live_cust_support_bp.post("/sessions/<session_id>/flags")
@require_session(allowed_roles=["support"])
def flag_question(session_id):
    # Flag a message the bot struggled with for follow-up
    data = request.get_json(force=True, silent=True) or {}
    agent_id = g.current_user["id"]
    message_id = data.get("message_id")
    reason = data.get("reason")
    if not message_id or not reason:
        return service.error("message_id and reason are required")
    return service.flag_question(session_id, agent_id, message_id, reason)


@live_cust_support_bp.post("/sessions/<session_id>/csat")
@require_session(allowed_roles=["customer"])
@maybe_limit("20 per minute")
def submit_csat(session_id):
    """Authenticated CSAT submission endpoint for customer-owned sessions."""
    data, error = validate_body(CSATPayload)
    if error:
        return error
    return service.submit_csat_for_customer(session_id, g.current_user["id"], data.rating, data.feedback)


@live_cust_support_bp.post("/sessions/from_rasa/csat")
@maybe_limit("30 per minute")
def submit_csat_from_rasa():
    """Rasa webhook: expects sender_id and rating (1-5), optional feedback."""
    guard = _require_rasa_secret()
    if guard:
        return guard
    data, error = validate_body(CSATPayload)
    if error:
        return error
    sender_id = data.sender_id or ""
    if not sender_id:
        return service.error("sender_id is required")
    return service.submit_csat_from_rasa(sender_id, data.rating, data.feedback)


@live_cust_support_bp.post("/guest/escalate")
def guest_escalate():
    """Hard-disabled guest escalation endpoint."""
    return service.error("Guest escalation is disabled", status=403)


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
