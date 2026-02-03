import re
from flask import Blueprint, current_app, jsonify, request

product_categories_bp = Blueprint("product_categories", __name__)
admin_product_categories_bp = Blueprint("admin_product_categories", __name__)


def _slugify(value: str) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return raw


@product_categories_bp.get("/")
def list_categories():
    supabase = current_app.config["SUPABASE"]
    res = (
        supabase.table("product_category")
        .select("*")
        .neq("slug", "uncategorized")
        .order("name", desc=False)
        .execute()
    )
    return jsonify(res.data or [])


@admin_product_categories_bp.post("/product-categories")
def create_category():
    supabase = current_app.config["SUPABASE"]
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    slug = _slugify(payload.get("slug") or name)
    if not slug:
        return jsonify({"error": "Invalid category name"}), 400

    existing = (
        supabase.table("product_category")
        .select("id")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if existing.data:
        return jsonify({"error": "Category already exists"}), 409

    res = (
        supabase.table("product_category")
        .insert({"name": name, "slug": slug})
        .execute()
    )
    return jsonify((res.data or [{}])[0]), 201


@admin_product_categories_bp.delete("/product-categories/<category_id>")
def delete_category(category_id):
    supabase = current_app.config["SUPABASE"]
    existing = (
        supabase.table("product_category")
        .select("id, slug")
        .eq("id", category_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        existing = (
            supabase.table("product_category")
            .select("id, slug")
            .eq("slug", category_id)
            .maybe_single()
            .execute()
        )
    if not existing.data:
        return jsonify({"error": "Category not found"}), 404
    slug = existing.data.get("slug")
    if slug == "uncategorized":
        return jsonify({"error": "Cannot delete fallback category"}), 400

    fallback = (
        supabase.table("product_category")
        .select("id, slug")
        .eq("slug", "uncategorized")
        .maybe_single()
        .execute()
    )
    fallback_data = getattr(fallback, "data", None) if fallback is not None else None
    if not fallback_data:
        supabase.table("product_category").insert(
            {"name": "Uncategorized", "slug": "uncategorized"}
        ).execute()

    supabase.table("products").update({"category": "uncategorized"}).eq("category", slug).execute()

    res = supabase.table("product_category").delete().eq("id", category_id).execute()
    return jsonify({"deleted": bool(res.data), "id": category_id, "migrated_to": "uncategorized"})
