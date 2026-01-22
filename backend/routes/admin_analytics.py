from flask import Blueprint, current_app, jsonify

from utils.auth_middleware import require_session
from services import admin_analytics


admin_analytics_bp = Blueprint("admin_analytics", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


@admin_analytics_bp.get("/insights")
@require_session(allowed_roles=["admin"])
def get_business_insights():
    supabase = current_app.config["SUPABASE"]
    data = admin_analytics.fetch_business_insights(supabase)
    return _ok(data)
