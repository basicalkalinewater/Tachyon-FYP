from flask import Blueprint, current_app, jsonify, request
import logging

try:
    from ..utils.mappers import map_product
    from ..services import promotion_service
    from ..limiter import maybe_limit
except ImportError:
    from utils.mappers import map_product
    from services import promotion_service
    from limiter import maybe_limit

products_bp = Blueprint("products", __name__)

def _include_promotions() -> bool:
    raw = request.args.get("include_promotions")
    if raw is None:
        return True
    return str(raw).strip().lower() in {"1", "true", "yes"}

@products_bp.get("/")
def get_products():
    supabase = current_app.config["SUPABASE"]
    try:
        try:
            min_p = float(request.args.get("min_price", 0))
            max_p = float(request.args.get("max_price", 1000000))
        except (ValueError, TypeError):
            min_p, max_p = 0, 1000000
        
        res = (
            supabase.table("products")
            .select("*")
            .gte("price", min_p)
            .lte("price", max_p)
            .order("id", desc=False)
            .execute()
        )
        
        items = [map_product(r) for r in res.data or []]
        if _include_promotions():
            active_promos = promotion_service.list_active_promotions(supabase)
            items = [promotion_service.apply_best_promotion(item, active_promos) for item in items]
        return jsonify(items)
    except Exception as err:
        logging.error(f"DEBUG ERROR: {err}")
        return jsonify({"error": str(err)}), 500

@products_bp.post("/")
def create_product():
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True)
        
        # 1. Insert into products table
        res = supabase.table("products").insert(payload).execute()
        
        if not res.data:
            return jsonify({"error": "Failed to create product record"}), 500
        
        new_product = res.data[0]
        new_id = new_product["id"]

        # 2. Initialize Stock Row
        # I removed 'low_stock_threshold' to bypass the error.
        # Once you verify your column name in Supabase, you can add it back.
        stock_init = {
            "product_id": new_id,
            "quantity_available": 0
        }
        
        try:
            supabase.table("product_stock").insert(stock_init).execute()
        except Exception as stock_err:
            # We log this but don't fail the whole request because the product was created
            logging.error(f"Stock Init Failed (Check column names): {stock_err}")

        return jsonify(map_product(new_product)), 201
        
    except Exception as err:
        logging.error(f"Create Product & Stock Error: {err}")
        return jsonify({"error": str(err)}), 500

@products_bp.route("/<product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    
    try:
        if request.method == "GET":
            res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
            if not res.data: 
                return jsonify({"error": "Product not found"}), 404
            item = map_product(res.data)
            if _include_promotions():
                active_promos = promotion_service.list_active_promotions(supabase)
                item = promotion_service.apply_best_promotion(item, active_promos)
            return jsonify(item)

        elif request.method == "PUT":
            payload = request.get_json(force=True)
            res = supabase.table("products").update(payload).eq("id", product_id).execute()
            if not res.data:
                return jsonify({"error": "Product not found or update failed"}), 404
            return jsonify(map_product(res.data[0])), 200

        elif request.method == "DELETE":
            # Delete stock first (child) then product (parent) to avoid FK errors
            supabase.table("product_stock").delete().eq("product_id", product_id).execute()
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200

    except Exception as err:
        return jsonify({"error": str(err)}), 500