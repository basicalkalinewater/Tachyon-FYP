from flask import Blueprint, current_app, jsonify, request

try:
    from ..utils.auth_middleware import require_session
    from ..services import promotion_service
    from ..schemas.promotion import PromotionCreatePayload, PromotionUpdatePayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
except ImportError:
    from utils.auth_middleware import require_session
    from services import promotion_service
    from schemas.promotion import PromotionCreatePayload, PromotionUpdatePayload
    from schemas.base import validate_body
    from limiter import maybe_limit


admin_promotions_bp = Blueprint("admin_promotions", __name__)


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


@admin_promotions_bp.get("/promotions")
@require_session(allowed_roles=["admin"])
@maybe_limit("120 per minute")
def list_promotions():
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
        "scope": (q.get("scope") or "").strip() or None,
        "limit": max(1, min(limit, 200)),
        "offset": max(0, offset),
    }
    data = promotion_service.list_promotions(supabase, filters)
    return _ok(data)


@admin_promotions_bp.post("/promotions")
@require_session(allowed_roles=["admin"])
@maybe_limit("60 per minute")
def create_promotion():
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(PromotionCreatePayload)
    if error:
        return error
    try:
        data = promotion_service.create_promotion(supabase, body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _ok(data)


@admin_promotions_bp.put("/promotions/<promotion_id>")
@require_session(allowed_roles=["admin"])
def update_promotion(promotion_id):
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(PromotionUpdatePayload)
    if error:
        return error
    try:
        data = promotion_service.update_promotion(supabase, promotion_id, body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return _ok(data)


@admin_promotions_bp.delete("/promotions/<promotion_id>")
@require_session(allowed_roles=["admin"])
def delete_promotion(promotion_id):
    supabase = current_app.config["SUPABASE"]
    data = promotion_service.delete_promotion(supabase, promotion_id)
    return _ok(data)
