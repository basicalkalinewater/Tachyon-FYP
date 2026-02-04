import os
import logging
import json
import re
from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

try:
    from ..utils.mappers import map_product
    from ..services import promotion_service
except ImportError:
    from utils.mappers import map_product
    from services import promotion_service

products_bp = Blueprint("products", __name__)

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
FRONTEND_ASSETS_PATH = os.path.join(project_root, "frontend", "public", "assets", "products")

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


def _image_folder_warning(category, category_folder):
    if not category:
        return None
    if category_folder == "uncategorized":
        return f"Image saved to 'uncategorized' because category '{category}' could not be normalized."
    return None

@products_bp.route("/", methods=["GET", "POST"])
def handle_products_collection():
    supabase = current_app.config["SUPABASE"]
    if request.method == "GET":
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

    if request.method == "POST":
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

            warning = None
            # Image handling
            if "image" in request.files:
                file = request.files["image"]
                if file and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    category_folder = safe_category_folder(payload.get("category"))
                    warning = _image_folder_warning(payload.get("category"), category_folder)
                    category_path = os.path.join(FRONTEND_ASSETS_PATH, category_folder)
                    os.makedirs(category_path, exist_ok=True)
                    save_path = os.path.join(category_path, filename)
                    file.save(save_path)
                    payload["image_url"] = f"/assets/products/{category_folder}/{filename}"
                else:
                    return jsonify({"error": "Invalid image file type"}), 400

            if "title" not in payload or "price" not in payload:
                return jsonify({"error": "Missing required fields: title and price"}), 400

            res = supabase.table("products").insert(payload).execute()
            if not res.data:
                return jsonify({"error": "Create failed in Database"}), 500

            product = map_product(res.data[0])
            if warning:
                logging.warning(warning)
                product["warning"] = warning
            return jsonify(product), 201
        except Exception as err:
            logging.error(f"Create Product Error: {err}", exc_info=True)
            return jsonify({"error": str(err)}), 500

@products_bp.route("/<string:product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    try:
        if request.method == "PUT":
            print(f"\n--- INCOMING UPDATE FOR ID: {product_id} ---")
            print(f"Form Data received: {request.form.to_dict().keys()}")
            print(f"Files received: {request.files.keys()}") # <--- CHECK THIS IN YOUR TERMINAL

            update_payload = {}
            warning = None
            
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
            # We check for the key 'image' specifically
            if 'image' in request.files:
                file = request.files['image']
                if file and allowed_file(file.filename):
                    filename = secure_filename(file.filename)

                    category_for_image = update_payload.get("category")
                    if not category_for_image:
                        existing = supabase.table("products").select("category").eq("id", product_id).maybe_single().execute()
                        if existing.data:
                            category_for_image = existing.data.get("category")

                    category_folder = safe_category_folder(category_for_image)
                    warning = _image_folder_warning(category_for_image, category_folder)
                    category_path = os.path.join(FRONTEND_ASSETS_PATH, category_folder)
                    os.makedirs(category_path, exist_ok=True)
                    save_path = os.path.join(category_path, filename)
                    file.save(save_path)
                    
                    print(f"SUCCESS: Saved image to {save_path}")
                    update_payload["image_url"] = f"/assets/products/{category_folder}/{filename}"
                else:
                    print("WARNING: File present but extension not allowed or file empty.")
            else:
                print("DEBUG: No file found under the key 'image'.")

            # Update DB
            res = supabase.table("products").update(update_payload).eq("id", product_id).execute()
            
            if not res.data:
                return jsonify({"error": "Update failed in Database"}), 404
                
            product = map_product(res.data[0])
            if warning:
                logging.warning(warning)
                product["warning"] = warning
            return jsonify(product), 200

        elif request.method == "GET":
            include_promotions = _is_truthy(request.args.get("include_promotions"))
            res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
            if not res.data:
                return jsonify({"error": "Not found"}), 404
            product = map_product(res.data)
            if include_promotions:
                active_promos = promotion_service.list_active_promotions(supabase)
                product = promotion_service.apply_best_promotion(product, active_promos)
            return jsonify(product)

        elif request.method == "DELETE":
            supabase.table("product_stock").delete().eq("product_id", product_id).execute()
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200

    except Exception as err:
        print(f"CRITICAL ERROR: {str(err)}")
        return jsonify({"error": str(err)}), 500
