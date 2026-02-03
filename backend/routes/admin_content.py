from flask import Blueprint, current_app, jsonify, request

from utils.auth_middleware import require_session
from services import content_service


admin_content_bp = Blueprint("admin_content", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


@admin_content_bp.get("/faqs")
@require_session(allowed_roles=["admin"])
def list_faqs():
    supabase = current_app.config["SUPABASE"]
    data = content_service.list_faqs(supabase)
    return _ok(data)


@admin_content_bp.post("/faqs")
@require_session(allowed_roles=["admin"])
def create_faq():
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    question = (body.get("question") or "").strip()
    answer = (body.get("answer") or "").strip()
    sort_order = int(body.get("sort_order") or 0)
    data = content_service.create_faq(supabase, question, answer, sort_order)
    return _ok(data)


@admin_content_bp.put("/faqs/<faq_id>")
@require_session(allowed_roles=["admin"])
def update_faq(faq_id):
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    updates = {}
    if "question" in body:
        updates["question"] = (body.get("question") or "").strip()
    if "answer" in body:
        updates["answer"] = (body.get("answer") or "").strip()
    if "sort_order" in body:
        updates["sort_order"] = int(body.get("sort_order") or 0)
    data = content_service.update_faq(supabase, faq_id, updates)
    return _ok(data)


@admin_content_bp.delete("/faqs/<faq_id>")
@require_session(allowed_roles=["admin"])
def delete_faq(faq_id):
    supabase = current_app.config["SUPABASE"]
    data = content_service.delete_faq(supabase, faq_id)
    return _ok(data)


@admin_content_bp.get("/policies")
@require_session(allowed_roles=["admin"])
def list_policies():
    supabase = current_app.config["SUPABASE"]
    data = content_service.list_policies(supabase)
    return _ok(data)


@admin_content_bp.post("/policies")
@require_session(allowed_roles=["admin"])
def create_policy():
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    slug = (body.get("slug") or "").strip() or None
    sort_order = int(body.get("sort_order") or 0)
    data = content_service.create_policy(supabase, title, content, sort_order, slug)
    return _ok(data)


@admin_content_bp.put("/policies/<policy_id>")
@require_session(allowed_roles=["admin"])
def update_policy(policy_id):
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    updates = {}
    if "title" in body:
        updates["title"] = (body.get("title") or "").strip()
    if "content" in body:
        updates["content"] = (body.get("content") or "").strip()
    if "slug" in body:
        updates["slug"] = (body.get("slug") or "").strip() or None
    if "sort_order" in body:
        updates["sort_order"] = int(body.get("sort_order") or 0)
    data = content_service.update_policy(supabase, policy_id, updates)
    return _ok(data)


@admin_content_bp.delete("/policies/<policy_id>")
@require_session(allowed_roles=["admin"])
def delete_policy(policy_id):
    supabase = current_app.config["SUPABASE"]
    data = content_service.delete_policy(supabase, policy_id)
    return _ok(data)


@admin_content_bp.get("/announcement")
@require_session(allowed_roles=["admin"])
def get_announcement():
    supabase = current_app.config["SUPABASE"]
    data = content_service.get_announcement(supabase)
    return _ok(data)


@admin_content_bp.put("/announcement")
@require_session(allowed_roles=["admin"])
def upsert_announcement():
    supabase = current_app.config["SUPABASE"]
    body = request.get_json(force=True, silent=True) or {}
    payload = {
        "id": body.get("id"),
        "message": (body.get("message") or "").strip(),
        "link_url": (body.get("link_url") or "").strip() or None,
        "link_label": (body.get("link_label") or "").strip() or None,
        "enabled": bool(body.get("enabled", True)),
    }
    if not payload["message"]:
        return jsonify({"error": "message is required"}), 400
    data = content_service.upsert_announcement(supabase, payload)
    return _ok(data)
