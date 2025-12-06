from flask import Blueprint, request

from ..services import live_cust_support_service as service
from ..utils.auth_middleware import require_session

# Blueprint for live customer support chat; mounted under /support
live_cust_support_bp = Blueprint("live_cust_support", __name__)


@live_cust_support_bp.post("/sessions/from_rasa")
def create_session_from_rasa():
    # Create a new session when Rasa hands off to a human
    data = request.get_json(force=True, silent=True) or {}
    sender_id = data.get("sender_id")
    last_message = data.get("last_message")
    if not sender_id or not last_message:
        return service.error("sender_id and last_message are required")
    return service.create_session_from_rasa(sender_id, last_message)


@live_cust_support_bp.post("/sessions/from_rasa/message")
def append_message_from_rasa():
    # Append a customer message to the latest open session for a sender
    data = request.get_json(force=True, silent=True) or {}
    sender_id = data.get("sender_id")
    last_message = data.get("last_message")
    if not sender_id or not last_message:
        return service.error("sender_id and last_message are required")
    return service.append_message_from_rasa(sender_id, last_message)


@live_cust_support_bp.post("/sessions/<session_id>/customer/messages")
def send_customer_message(session_id):
    # Direct customer message to a session (bypasses Rasa)
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message")
    customer_id = data.get("customer_id")
    if not message:
        return service.error("message is required")
    return service.send_customer_message(session_id, message, customer_id)


@live_cust_support_bp.get("/sessions/<session_id>/stream")
@require_session(allowed_roles=["support"])
def stream_session(session_id):
    # SSE stream of new messages for a session
    return service.stream_session(session_id)


@live_cust_support_bp.get("/queue/<sender_id>")
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
    return service.get_session(session_id)


@live_cust_support_bp.get("/sessions_public/<session_id>")
def get_session_public(session_id):
    """
    Public read-only endpoint used by the customer widget to poll session + messages.
    """
    return service.get_session(session_id)


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
def submit_csat(session_id):
    """Public CSAT submission endpoint (can be called by Rasa or email link)."""
    data = request.get_json(force=True, silent=True) or {}
    rating = data.get("rating")
    feedback = data.get("feedback")
    token = request.args.get("token")  # reserved for future signed links
    return service.submit_csat(session_id, rating, feedback, token)


@live_cust_support_bp.post("/sessions/from_rasa/csat")
def submit_csat_from_rasa():
    """Rasa webhook: expects sender_id and rating (1-5), optional feedback."""
    data = request.get_json(force=True, silent=True) or {}
    sender_id = data.get("sender_id")
    rating = data.get("rating")
    feedback = data.get("feedback")
    if not sender_id or rating is None:
        return service.error("sender_id and rating are required")
    return service.submit_csat_from_rasa(sender_id, rating, feedback)


@live_cust_support_bp.get("/csat/summary")
@require_session(allowed_roles=["admin", "support"])
def csat_summary():
    window_days = int(request.args.get("window_days", 30))
    agent_id = request.args.get("agent_id")
    return service.get_csat_summary(window_days, agent_id)


@live_cust_support_bp.get("/csat/responses")
@require_session(allowed_roles=["admin", "support"])
def csat_responses():
    limit = int(request.args.get("limit", 50))
    return service.list_csat_responses(limit)

