import logging
import json
import re
import mimetypes
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

try:
    from ..utils.mappers import map_product
    from ..utils.auth_middleware import require_session
    from ..services import promotion_service
except ImportError:
    from utils.mappers import map_product
    from utils.auth_middleware import require_session
    from services import promotion_service

products_bp = Blueprint("products", __name__)
PRODUCT_IMAGES_BUCKET = "product-images"

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def _normalize_category_slug(value):
    raw = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return raw

def _ensure_category_exists(supabase, category):
    slug = _normalize_category_slug(category)
    if not slug:
        return None, "Invalid category"
    res = (
        supabase.table("product_category")
        .select("slug")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None, f"Unknown category '{category}'. Create it first."
    return slug, None

def _is_truthy(value):
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def safe_category_folder(category):
    if not category:
        return "uncategorized"
    raw = re.sub(r"[^a-z0-9]+", "-", str(category).lower()).strip("-")
    if not raw:
        return "uncategorized"
    if raw == "mice":
        return "mouse"
    if raw in {"other", "others"}:
        return "others"
    return raw


def _upload_product_image(supabase, file, category_slug):
    filename = secure_filename(file.filename or "")
    if not filename or not allowed_file(filename):
        return None, "Invalid image file type"

    ext = filename.rsplit(".", 1)[1].lower()
    storage_name = f"{uuid4().hex}.{ext}"
    folder = safe_category_folder(category_slug)
    storage_path = f"{folder}/{storage_name}"
    content_type = file.mimetype or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    try:
        file.stream.seek(0)
        data = file.read()
        if not data:
            return None, "Empty image file"

        bucket = supabase.storage.from_(PRODUCT_IMAGES_BUCKET)
        bucket.upload(storage_path, data, {"content-type": content_type, "upsert": "false"})
        public_result = bucket.get_public_url(storage_path)
        public_url = public_result.get("publicUrl") if isinstance(public_result, dict) else str(public_result)
        if not public_url:
            return None, "Failed to resolve uploaded image URL"
        return public_url, None
    except Exception as exc:
        return None, f"Storage upload failed: {exc}"

@products_bp.get("/")
def list_products():
    supabase = current_app.config["SUPABASE"]
    include_promotions = _is_truthy(request.args.get("include_promotions"))
    products_res = supabase.table("products").select("*").order("id", desc=False).execute()
    stock_res = supabase.table("product_stock_view").select("id,quantity_available").execute()
    stock_map = {row.get("id"): row.get("quantity_available") for row in (stock_res.data or [])}
    products = []
    for row in products_res.data or []:
        row["quantity_available"] = stock_map.get(row.get("id"))
        products.append(map_product(row))
    if include_promotions:
        active_promos = promotion_service.list_active_promotions(supabase)
        products = [
            promotion_service.apply_best_promotion(p, active_promos)
            for p in products
        ]
    return jsonify(products)


@products_bp.post("/")
@require_session(allowed_roles=["admin"])
def create_product():
    supabase = current_app.config["SUPABASE"]
    try:
        payload = {}
        form = request.form or {}

        # Basic text fields
        for field in ["title", "category", "price", "Brand", "description"]:
            val = form.get(field)
            if val is not None and val != "":
                payload[field] = float(val) if field == "price" else val

        if "category" in payload:
            normalized, error = _ensure_category_exists(supabase, payload.get("category"))
            if error:
                return jsonify({"error": error}), 400
            payload["category"] = normalized

        # Specs JSON
        if form.get("specs"):
            try:
                payload["specs"] = json.loads(form.get("specs"))
            except json.JSONDecodeError:
                return jsonify({"error": "Invalid specs JSON"}), 400

        # Image handling
        if "image" in request.files:
            file = request.files["image"]
            if file:
                image_url, upload_error = _upload_product_image(supabase, file, payload.get("category"))
                if upload_error:
                    return jsonify({"error": upload_error}), 400
                payload["image_url"] = image_url

        if "title" not in payload or "price" not in payload:
            return jsonify({"error": "Missing required fields: title and price"}), 400

        res = supabase.table("products").insert(payload).execute()
        if not res.data:
            return jsonify({"error": "Create failed in Database"}), 500

        product = map_product(res.data[0])
        return jsonify(product), 201
    except Exception as err:
        logging.error(f"Create Product Error: {err}", exc_info=True)
        return jsonify({"error": str(err)}), 500


@products_bp.get("/<string:product_id>")
def get_product(product_id):
    supabase = current_app.config["SUPABASE"]
    include_promotions = _is_truthy(request.args.get("include_promotions"))
    res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
    if not res.data:
        return jsonify({"error": "Not found"}), 404
    product = map_product(res.data)
    if include_promotions:
        active_promos = promotion_service.list_active_promotions(supabase)
        product = promotion_service.apply_best_promotion(product, active_promos)
    return jsonify(product)


@products_bp.put("/<string:product_id>")
@require_session(allowed_roles=["admin"])
def update_product(product_id):
    supabase = current_app.config["SUPABASE"]
    try:
        print(f"\n--- INCOMING UPDATE FOR ID: {product_id} ---")
        print(f"Form Data received: {request.form.to_dict().keys()}")
        print(f"Files received: {request.files.keys()}") # <--- CHECK THIS IN YOUR TERMINAL

        update_payload = {}

        # Text fields
        for field in ["title", "category", "price", "Brand", "description"]:
            val = request.form.get(field)
            if val is not None:
                update_payload[field] = float(val) if field == "price" else val

        if "category" in update_payload:
            normalized, error = _ensure_category_exists(supabase, update_payload.get("category"))
            if error:
                return jsonify({"error": error}), 400
            update_payload["category"] = normalized

        if request.form.get("specs"):
            update_payload["specs"] = json.loads(request.form.get("specs"))

        # --- IMAGE HANDLING ---
        if 'image' in request.files:
            file = request.files['image']
            if file:
                category_for_image = update_payload.get("category")
                if not category_for_image:
                    existing = supabase.table("products").select("category").eq("id", product_id).maybe_single().execute()
                    if existing.data:
                        category_for_image = existing.data.get("category")

                image_url, upload_error = _upload_product_image(supabase, file, category_for_image)
                if upload_error:
                    return jsonify({"error": upload_error}), 400
                update_payload["image_url"] = image_url
        else:
            print("DEBUG: No file found under the key 'image'.")

        # Update DB
        res = supabase.table("products").update(update_payload).eq("id", product_id).execute()

        if not res.data:
            return jsonify({"error": "Update failed in Database"}), 404

        product = map_product(res.data[0])
        return jsonify(product), 200
    except Exception as err:
        print(f"CRITICAL ERROR: {str(err)}")
        return jsonify({"error": str(err)}), 500


@products_bp.delete("/<string:product_id>")
@require_session(allowed_roles=["admin"])
def delete_product(product_id):
    supabase = current_app.config["SUPABASE"]
    try:
        supabase.table("product_stock").delete().eq("product_id", product_id).execute()
        supabase.table("products").delete().eq("id", product_id).execute()
        return jsonify({"message": "Deleted"}), 200
    except Exception as err:
        print(f"CRITICAL ERROR: {str(err)}")
        return jsonify({"error": str(err)}), 500
