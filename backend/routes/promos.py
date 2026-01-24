from flask import Blueprint, current_app, jsonify

try:
    from ..services import promo_service
    from ..schemas.promo import PromoValidatePayload
    from ..schemas.base import validate_body
    from ..limiter import maybe_limit
except ImportError:
    from services import promo_service
    from schemas.promo import PromoValidatePayload
    from schemas.base import validate_body
    from limiter import maybe_limit


promos_bp = Blueprint("promos", __name__)


@promos_bp.post("/validate")
@maybe_limit("120 per minute")
def validate_promo():
    supabase = current_app.config["SUPABASE"]
    body, error = validate_body(PromoValidatePayload)
    if error:
        return error
    result, err = promo_service.validate_code(supabase, body.code, body.cartTotal)
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"valid": True, "promo": result})
