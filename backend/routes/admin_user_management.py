from flask import Blueprint, current_app, jsonify, request, g

try:
    from ..utils.auth_middleware import require_session
    from ..services import admin_user_management
    from ..schemas.admin import CreateUserPayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
except ImportError:
    from utils.auth_middleware import require_session
    from services import admin_user_management
    from schemas.admin import CreateUserPayload
    from schemas.base import validate_body
    from limiter import maybe_limit


admin_users_bp = Blueprint("admin_users", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


@admin_users_bp.get("/users")
@require_session(allowed_roles=["admin"])
@maybe_limit("120 per minute")
def list_users():
    supabase = current_app.config["SUPABASE"]
    q = request.args
    filters = {
        "email_substr": (q.get("email") or "").strip() or None,
        "role": (q.get("role") or "").strip() or None,
        "status": (q.get("status") or "").strip() or None,
        "limit": int(q.get("limit", 50)),
        "offset": int(q.get("offset", 0)),
    }
    data = admin_user_management.list_users(supabase, filters)
    return _ok(data)


@admin_users_bp.post("/users")
@require_session(allowed_roles=["admin"])
@maybe_limit("60 per minute")
def create_user():
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(CreateUserPayload)
    if error:
        return error
    email = body.email.lower()
    role = body.role
    password = body.password
    full_name = (body.full_name or "").strip() if hasattr(body, "full_name") else ""
    phone = (body.phone or "").strip() if hasattr(body, "phone") else ""
    data = admin_user_management.create_user(supabase, email, role, password, full_name, phone)
    return _ok(data)


@admin_users_bp.put("/users/<user_id>")
@require_session(allowed_roles=["admin"])
def update_user(user_id):
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    data = admin_user_management.update_user(
        supabase,
        user_id,
        role=body.get("role"),
        status=body.get("status"),
        full_name=body.get("full_name"),
        phone=body.get("phone"),
        password=body.get("password"),
    )
    return _ok(data)


@admin_users_bp.delete("/users/<user_id>")
@require_session(allowed_roles=["admin"])
def disable_user(user_id):
    supabase = current_app.config["SUPABASE"]
    admin_user_management.disable_user(supabase, user_id)
    return _ok({"disabled": True})
