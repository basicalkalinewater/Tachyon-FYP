from flask import Blueprint, current_app, jsonify, request

try:
    from ..utils.auth_middleware import require_session
    from ..services import promo_service
    from ..schemas.promo import PromoCreatePayload, PromoUpdatePayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
except ImportError:
    from utils.auth_middleware import require_session
    from services import promo_service
    from schemas.promo import PromoCreatePayload, PromoUpdatePayload
    from schemas.base import validate_body
    from limiter import maybe_limit


admin_promos_bp = Blueprint("admin_promos", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


def _parse_bool(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return None
    txt = str(val).strip().lower()
    if txt in {"true", "1", "yes"}:
        return True
    if txt in {"false", "0", "no"}:
        return False
    return None


@admin_promos_bp.get("/promo-codes")
@require_session(allowed_roles=["admin"])
@maybe_limit("120 per minute")
def list_promos():
    supabase = current_app.config["SUPABASE"]
    q = request.args
    try:
        limit = int(q.get("limit", 50))
    except ValueError:
        limit = 50
    try:
        offset = int(q.get("offset", 0))
    except ValueError:
        offset = 0
    filters = {
        "search": (q.get("q") or "").strip() or None,
        "active": _parse_bool(q.get("active")),
        "limit": max(1, min(limit, 200)),
        "offset": max(0, offset),
    }
    data = promo_service.list_promos(supabase, filters)
    return _ok(data)


@admin_promos_bp.post("/promo-codes")
@require_session(allowed_roles=["admin"])
@maybe_limit("60 per minute")
def create_promo():
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(PromoCreatePayload)
    if error:
        return error
    try:
        data = promo_service.create_promo(supabase, body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _ok(data)


@admin_promos_bp.put("/promo-codes/<promo_id>")
@require_session(allowed_roles=["admin"])
def update_promo(promo_id):
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(PromoUpdatePayload)
    if error:
        return error
    try:
        data = promo_service.update_promo(supabase, promo_id, body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _ok(data)


@admin_promos_bp.delete("/promo-codes/<promo_id>")
@require_session(allowed_roles=["admin"])
def delete_promo(promo_id):
    supabase = current_app.config["SUPABASE"]
    data = promo_service.delete_promo(supabase, promo_id)
    return _ok(data)
