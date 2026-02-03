from flask import Blueprint, current_app, jsonify, request, g

from utils.auth_middleware import require_session
from utils.mappers import map_product


product_reviews_bp = Blueprint("product_reviews", __name__)


def _ok(data=None):
    return jsonify({"success": True, "data": data})


def _refresh_product_rating(supabase, product_id: str):
    res = (
        supabase.table("product_reviews")
        .select("rating")
        .eq("product_id", product_id)
        .execute()
    )
    ratings = [r.get("rating") for r in (res.data or []) if r.get("rating") is not None]
    if not ratings:
        supabase.table("products").update({"rating_avg": None, "rating_count": 0}).eq("id", product_id).execute()
        return
    count = len(ratings)
    avg = round(sum(ratings) / count, 2)
    supabase.table("products").update({"rating_avg": avg, "rating_count": count}).eq("id", product_id).execute()


@product_reviews_bp.get("/products/<product_id>/reviews")
def list_reviews(product_id):
    supabase = current_app.config["SUPABASE"]
    res = (
        supabase.table("product_reviews")
        .select("*")
        .eq("product_id", product_id)
        .order("created_at", desc=True)
        .execute()
    )
    return _ok(res.data or [])


@product_reviews_bp.post("/products/<product_id>/reviews")
@require_session(allowed_roles=["customer"])
def create_review(product_id):
    supabase = current_app.config["SUPABASE"]
    payload = request.get_json(force=True, silent=True) or {}
    rating = int(payload.get("rating") or 0)
    title = (payload.get("title") or "").strip() or None
    body = (payload.get("body") or "").strip() or None
    if rating < 1 or rating > 5:
        return jsonify({"error": "rating must be between 1 and 5"}), 400

    user_id = g.current_user.get("id")

    res = (
        supabase.table("product_reviews")
        .insert({
            "product_id": product_id,
            "user_id": user_id,
            "rating": rating,
            "title": title,
            "body": body,
        })
        .execute()
    )
    _refresh_product_rating(supabase, product_id)
    return _ok((res.data or [{}])[0])


@product_reviews_bp.get("/reviews/mine")
@require_session(allowed_roles=["customer"])
def list_my_reviews():
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user.get("id")
    product_id = request.args.get("product_id")
    query = supabase.table("product_reviews").select("*").eq("user_id", user_id)
    if product_id:
        query = query.eq("product_id", product_id)
    res = query.order("created_at", desc=True).execute()
    return _ok(res.data or [])


@product_reviews_bp.get("/reviews/eligibility")
@require_session(allowed_roles=["customer"])
def review_eligibility():
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user.get("id")
    product_id = request.args.get("product_id")
    if not product_id:
        return jsonify({"error": "product_id is required"}), 400
    product_res = (
        supabase.table("products")
        .select("title")
        .eq("id", product_id)
        .maybe_single()
        .execute()
    )
    title = (product_res.data or {}).get("title")
    if not title:
        return _ok({"eligible": False})
    res = (
        supabase.table("customer_order_item")
        .select("id, product_name, customer_order!inner(status, user_id)")
        .eq("customer_order.user_id", user_id)
        .ilike("product_name", f"%{title}%")
        .execute()
    )
    rows = res.data or []
    eligible = any(
        "delivered" in str((row.get("customer_order") or {}).get("status") or "").lower()
        for row in rows
    )
    return _ok({"eligible": eligible})


@product_reviews_bp.put("/reviews/<review_id>")
@require_session(allowed_roles=["customer"])
def update_review(review_id):
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user.get("id")
    payload = request.get_json(force=True, silent=True) or {}
    updates = {}
    if "rating" in payload:
        rating = int(payload.get("rating") or 0)
        if rating < 1 or rating > 5:
            return jsonify({"error": "rating must be between 1 and 5"}), 400
        updates["rating"] = rating
    if "title" in payload:
        updates["title"] = (payload.get("title") or "").strip() or None
    if "body" in payload:
        updates["body"] = (payload.get("body") or "").strip() or None
    if not updates:
        return jsonify({"error": "No updates provided"}), 400

    existing = (
        supabase.table("product_reviews")
        .select("id, product_id")
        .eq("id", review_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        return jsonify({"error": "Review not found"}), 404

    res = supabase.table("product_reviews").update(updates).eq("id", review_id).execute()
    _refresh_product_rating(supabase, existing.data.get("product_id"))
    return _ok((res.data or [{}])[0])


@product_reviews_bp.delete("/reviews/<review_id>")
@require_session(allowed_roles=["customer"])
def delete_review(review_id):
    supabase = current_app.config["SUPABASE"]
    user_id = g.current_user.get("id")
    existing = (
        supabase.table("product_reviews")
        .select("id, product_id")
        .eq("id", review_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        return jsonify({"error": "Review not found"}), 404
    supabase.table("product_reviews").delete().eq("id", review_id).execute()
    _refresh_product_rating(supabase, existing.data.get("product_id"))
    return _ok({"deleted": True, "id": review_id})

@product_reviews_bp.get("/reviews/featured")
def list_featured_reviews():
    supabase = current_app.config["SUPABASE"]
    limit = int(request.args.get("limit") or 6)
    res = (
        supabase.table("product_reviews")
        .select("id, rating, title, body, created_at, product_id, user_id, products:product_id ( title )")
        .order("created_at", desc=True)
        .execute()
    )
    data = res.data or []
    latest_by_user = {}
    for row in data:
        user_id = row.get("user_id")
        if not user_id:
            continue
        if user_id in latest_by_user:
            continue
        latest_by_user[user_id] = row
        if len(latest_by_user) >= limit:
            break

    mapped = []
    for row in latest_by_user.values():
        mapped.append(
            {
                "id": row.get("id"),
                "rating": row.get("rating"),
                "title": row.get("title"),
                "body": row.get("body"),
                "created_at": row.get("created_at"),
                "product": row.get("products") or {},
            }
        )
    return _ok(mapped)
