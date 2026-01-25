from flask import Blueprint, current_app, jsonify, request

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
        # Using .get() with defaults and a try/except for the float cast
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
            .order("id", desc=False) # Changed from price to id for stability
            .execute()
        )
        
        items = [map_product(r) for r in res.data or []]
        if _include_promotions():
            active_promos = promotion_service.list_active_promotions(supabase)
            items = [promotion_service.apply_best_promotion(item, active_promos) for item in items]
        return jsonify(items)
    except Exception as err:
        print(f"DEBUG ERROR: {err}") # This prints to your terminal!
        return jsonify({"error": str(err)}), 500

@products_bp.get("/category/<category_name>")
def get_products_by_category(category_name):
    """Fetch products belonging to a specific category."""
    supabase = current_app.config["SUPABASE"]
    try:
        res = (
            supabase.table("products")
            .select("*")
            .ilike("category", f"%{category_name}%") 
            .order("created_at", desc=True)
            .execute()
        )
        items = [map_product(r) for r in res.data or []]
        if _include_promotions():
            active_promos = promotion_service.list_active_promotions(supabase)
            items = [promotion_service.apply_best_promotion(item, active_promos) for item in items]
        return jsonify(items)
    except Exception as err:
        current_app.logger.error(f"Category search error: {err}")
        return jsonify({"error": str(err)}), 500

@products_bp.get("/title/<path:product_title>")
def get_products_by_title(product_title):
    """Search products by title (case-insensitive partial match)."""
    supabase = current_app.config["SUPABASE"]
    try:
        res = (
            supabase.table("products")
            .select("*")
            .ilike("title", f"%{product_title}%") 
            .order("title", desc=False)
            .execute()
        )
        items = [map_product(r) for r in res.data or []]
        if _include_promotions():
            active_promos = promotion_service.list_active_promotions(supabase)
            items = [promotion_service.apply_best_promotion(item, active_promos) for item in items]
        return jsonify(items)
    except Exception as err:
        current_app.logger.error(f"Title search error: {err}")
        return jsonify({"error": str(err)}), 500

@products_bp.post("/")
def create_product():
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True)
        # payload now looks like: 
        # {"title": "...", "brand": "...", "category": "...", "specs": {...}, "price": 199.99}
        res = supabase.table("products").insert(payload).execute()
        return jsonify(map_product(res.data[0])), 201
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# --- DYNAMIC ID ROUTE (Handles GET, PUT, DELETE) ---
@products_bp.route("/<product_id>", methods=["GET", "PUT", "DELETE"])
def handle_product_by_id(product_id):
    supabase = current_app.config["SUPABASE"]
    
    try:
        if request.method == "GET":
            # Fetch single product by ID
            res = supabase.table("products").select("*").eq("id", product_id).maybe_single().execute()
            if not res.data: 
                return jsonify({"error": "Product not found"}), 404
            item = map_product(res.data)
            if _include_promotions():
                active_promos = promotion_service.list_active_promotions(supabase)
                item = promotion_service.apply_best_promotion(item, active_promos)
            return jsonify(item)

        elif request.method == "PUT":
            # Update product details
            payload = request.get_json(force=True)
            res = supabase.table("products").update(payload).eq("id", product_id).execute()
            if not res.data:
                return jsonify({"error": "Product not found or update failed"}), 404
            return jsonify(map_product(res.data[0])), 200

        elif request.method == "DELETE":
            # Remove product
            supabase.table("products").delete().eq("id", product_id).execute()
            return jsonify({"message": "Deleted"}), 200

    except Exception as err:
        return jsonify({"error": str(err)}), 500
