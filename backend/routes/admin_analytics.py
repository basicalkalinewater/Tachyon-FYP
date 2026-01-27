from datetime import datetime
from flask import Blueprint, current_app, jsonify, request

try:
    from ..utils.auth_middleware import require_session
    from ..services import admin_analytics
except ImportError:
    from utils.auth_middleware import require_session
    from services import admin_analytics


admin_analytics_bp = Blueprint("admin_analytics", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


@admin_analytics_bp.get("/insights")
@require_session(allowed_roles=["admin"])
def get_business_insights():
    supabase = current_app.config["SUPABASE"]
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if month is not None and (month < 1 or month > 12):
        month = None
    now = datetime.utcnow()
    year = year or now.year
    month = month or now.month
    try:
        data = admin_analytics.fetch_business_insights(supabase, year=year, month=month)
    except Exception:
        data = admin_analytics.fetch_backup_insights(supabase, year=year, month=month)
    return _ok(data)


@admin_analytics_bp.get("/insights/history")
@require_session(allowed_roles=["admin"])
def get_business_insights_history():
    supabase = current_app.config["SUPABASE"]
    months = request.args.get("months", default=13, type=int)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if month is not None and (month < 1 or month > 12):
        month = None
    try:
        data = admin_analytics.fetch_business_insights_history(
            supabase,
            months=max(months, 1),
            year=year,
            month=month,
        )
    except Exception:
        data = {"months": [], "mode": "error", "requested_year": year, "requested_month": month}
    return _ok(data)
