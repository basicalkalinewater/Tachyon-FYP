from flask import Blueprint, current_app, jsonify, request

from services import content_service


content_bp = Blueprint("content", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


@content_bp.get("/faqs")
def public_faqs():
    supabase = current_app.config["SUPABASE"]
    data = content_service.list_faqs(supabase)
    return _ok(data)


@content_bp.get("/faqs/search")
def public_faq_search():
    supabase = current_app.config["SUPABASE"]
    query = (request.args.get("q") or "").strip()
    data = content_service.search_faqs(supabase, query, limit=3)
    return _ok(data)


@content_bp.get("/policies")
def public_policies():
    supabase = current_app.config["SUPABASE"]
    data = content_service.list_policies(supabase)
    return _ok(data)


@content_bp.get("/announcement")
def public_announcement():
    supabase = current_app.config["SUPABASE"]
    data = content_service.get_announcement(supabase)
    return _ok(data)
