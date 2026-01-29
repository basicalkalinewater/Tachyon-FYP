import os
import logging
import json
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

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@products_bp.route("/", methods=["GET", "POST"])
def handle_products_collection():
    supabase = current_app.config["SUPABASE"]
    if request.method == "GET":
        res = supabase.table("products").select("*").order("id", desc=False).execute()
        return jsonify([map_product(r) for r in res.data or []])

    if request.method == "POST":
        # logic for creation...
        return jsonify({"message": "creation logic here"}), 201

@products_bp.route("/<string:product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    try:
        if request.method == "PUT":
            print(f"\n--- INCOMING UPDATE FOR ID: {product_id} ---")
            print(f"Form Data received: {request.form.to_dict().keys()}")
            print(f"Files received: {request.files.keys()}") # <--- CHECK THIS IN YOUR TERMINAL

            update_payload = {}
            
            # Text fields
            for field in ["title", "category", "price", "Brand", "description"]:
                val = request.form.get(field)
                if val is not None:
                    update_payload[field] = float(val) if field == "price" else val
            
            if request.form.get("specs"):
                update_payload["specs"] = json.loads(request.form.get("specs"))

            # --- IMAGE HANDLING ---
            # We check for the key 'image' specifically
            if 'image' in request.files:
                file = request.files['image']
                if file and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    
                    # Force creation of path
                    os.makedirs(FRONTEND_ASSETS_PATH, exist_ok=True)
                    
                    save_path = os.path.join(FRONTEND_ASSETS_PATH, filename)
                    file.save(save_path)
                    
                    print(f"SUCCESS: Saved image to {save_path}")
                    update_payload["image_url"] = f"/assets/products/{filename}"
                else:
                    print("WARNING: File present but extension not allowed or file empty.")
            else:
                print("DEBUG: No file found under the key 'image'.")

            # Update DB
            res = supabase.table("products").update(update_payload).eq("id", product_id).execute()
            
            if not res.data:
                return jsonify({"error": "Update failed in Database"}), 404
                
            return jsonify(map_product(res.data[0])), 200

        elif request.method == "GET":
            res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
            return jsonify(map_product(res.data)) if res.data else (jsonify({"error": "Not found"}), 404)

        elif request.method == "DELETE":
            supabase.table("product_stock").delete().eq("product_id", product_id).execute()
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200

    except Exception as err:
        print(f"CRITICAL ERROR: {str(err)}")
        return jsonify({"error": str(err)}), 500