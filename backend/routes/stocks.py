from flask import Blueprint, current_app, jsonify, request
import logging

try:
    from ..utils.auth_middleware import require_session
except ImportError:
    from utils.auth_middleware import require_session

stocks_bp = Blueprint("stocks", __name__)

# Matches: GET /api/admin/stocks/ (Called by admin.js listProductStockView)
@stocks_bp.get("/")
@require_session(allowed_roles=["admin"])
def get_inventory_view():
    supabase = current_app.config.get("SUPABASE")
    try:
        res = supabase.table("product_stock_view").select("*").execute()
        return jsonify(res.data or []), 200
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@stocks_bp.post("/")
@require_session(allowed_roles=["admin"])
def create_stock_entry():
    supabase = current_app.config.get("SUPABASE")
    try:
        payload = request.get_json(force=True)
        product_id = payload.get("product_id") or payload.get("productId")
        quantity = payload.get("quantity_available")
        threshold = payload.get("low_stock_threshold", 10)

        if not product_id or quantity is None:
            return jsonify({"error": "Missing product_id or quantity_available"}), 400

        existing = (
            supabase.table("product_stock")
            .select("product_id")
            .eq("product_id", product_id)
            .maybe_single()
            .execute()
        )
        if existing.data:
            return jsonify({"error": "Stock entry already exists for this product"}), 409

        res = (
            supabase.table("product_stock")
            .insert(
                {
                    "product_id": product_id,
                    "quantity_available": int(quantity),
                    "low_stock_threshold": int(threshold),
                }
            )
            .execute()
        )
        return jsonify((res.data or [{}])[0]), 201
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# Matches: POST /api/admin/stocks/adjust/ (Matches admin.js adjustStock)
@stocks_bp.post("/adjust")
@stocks_bp.post("/adjust/")
@require_session(allowed_roles=["admin"])
def adjust_stock():
    supabase = current_app.config.get("SUPABASE")
    try:
        payload = request.get_json(force=True)
        # Handle both camelCase and snake_case for safety
        p_id = payload.get("productId") or payload.get("product_id")
        adj = payload.get("adjustment")

        if not p_id or adj is None:
            return jsonify({"error": "Missing productId or adjustment"}), 400

        # Fetch current stock row (new products may not have one yet).
        curr = (
            supabase.table("product_stock")
            .select("quantity_available")
            .eq("product_id", p_id)
            .maybe_single()
            .execute()
        )

        if not curr.data:
            # Validate product exists before creating a default stock row.
            product = (
                supabase.table("products")
                .select("id")
                .eq("id", p_id)
                .maybe_single()
                .execute()
            )
            if not product.data:
                return jsonify({"error": "Product not found"}), 404

            base_qty = 0
            new_total = base_qty + int(adj)
            supabase.table("product_stock").insert(
                {
                    "product_id": p_id,
                    "quantity_available": new_total,
                    "low_stock_threshold": 10,
                }
            ).execute()
            return jsonify({"message": "Success", "new_total": new_total}), 200

        new_total = curr.data["quantity_available"] + int(adj)
        
        # Update
        supabase.table("product_stock").update({"quantity_available": new_total}).eq("product_id", p_id).execute()

        return jsonify({"message": "Success", "new_total": new_total}), 200
    except Exception as err:
        return jsonify({"error": str(err)}), 500
    
@stocks_bp.patch("/<product_id>")
@require_session(allowed_roles=["admin"])
def update_stock_settings(product_id):
    supabase = current_app.config.get("SUPABASE")
    try:
        payload = request.get_json(force=True)
        
        # We only want to update specific fields like the threshold
        update_data = {}
        
        if "low_stock_threshold" in payload:
            update_data["low_stock_threshold"] = int(payload["low_stock_threshold"])

        if not update_data:
            return jsonify({"error": "No valid fields provided for update"}), 400

        # Update the product_stock table
        res = supabase.table("product_stock") \
            .update(update_data) \
            .eq("product_id", product_id) \
            .execute()

        return jsonify({"message": "Settings updated", "data": res.data}), 200
    except Exception as err:
        logging.error(f"Patch Stock Error: {err}")
        return jsonify({"error": str(err)}), 500
