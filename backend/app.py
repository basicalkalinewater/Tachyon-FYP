"""
Flask REST API that fronts Supabase tables for products and carts.
- CORS is enabled for the Vite frontend.
- Supabase client is initialized once and reused.
"""
import os
from dotenv import load_dotenv

# ✅ Load .env before any imports that depend on it
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
print("DATABASE_URL loaded:", os.getenv("DATABASE_URL"))  # optional check

from flask import Flask
from flask_cors import CORS
from supabase_client import get_supabase
from live_agent_api import live_agent_bp


app = Flask(__name__)
CORS(app)
supabase = get_supabase()
app.register_blueprint(live_agent_bp, url_prefix="/support")


def map_product(row):
    """Normalize DB product row into the shape the frontend expects."""
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "price": float(row.get("price", 0)),
        "image": row.get("image_url"),
        "category": row.get("category"),
        "rating": row.get("rating"),
        "rating_count": row.get("rating_count"),
        "specs": row.get("specs") or {},
    }


def map_cart_items(cart_id):
    """
    Fetch cart items with joined product rows and normalize the shape.
    Raises on Supabase errors so the route can return a 500 with the message.
    """
    res = (
        supabase.table("cart_items")
        .select(
            "cart_id, product_id, quantity, products:product_id ( id, title, description, price, image_url, category, rating, rating_count, specs )"
        )
        .eq("cart_id", cart_id)
        .execute()
    )
    items = []
    for row in res.data or []:
        product = row.get("products") or {}
        item = {
          **map_product(product),
          "id": row.get("product_id"),
          "qty": row.get("quantity", 1),
        }
        items.append(item)
    return items


def map_address(row):
    return {
        "id": row.get("id"),
        "label": row.get("label"),
        "recipient": row.get("recipient"),
        "line1": row.get("line1"),
        "line2": row.get("line2") or "",
        "city": row.get("city"),
        "postalCode": row.get("postal_code"),
        "country": row.get("country"),
        "phone": row.get("phone"),
        "isDefault": row.get("is_default", False),
    }


def map_payment(row):
    return {
        "id": row.get("id"),
        "brand": row.get("brand"),
        "last4": row.get("last4"),
        "expiry": row.get("expiry"),
        "nickname": row.get("nickname") or "",
        "isDefault": row.get("is_default", False),
    }


def map_order(row):
    items = row.get("customer_order_item") or []
    return {
        "orderId": row.get("order_code"),
        "date": row.get("placed_at"),
        "status": row.get("status"),
        "total": float(row.get("total", 0)),
        "items": [
            {
                "name": item.get("product_name"),
                "qty": item.get("quantity", 1),
                "price": float(item.get("unit_price", 0)),
            }
            for item in items
        ],
    }


def map_rma(row):
    return {
        "rmaId": row.get("rma_code"),
        "createdOn": row.get("created_at"),
        "product": row.get("product_name"),
        "status": row.get("status"),
        "issue": row.get("issue"),
        "lastUpdate": row.get("updated_at"),
    }


def ensure_profile_row(user_id):
    res = (
        supabase.table("customer_profile")
        .select("user_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        supabase.table("customer_profile").insert({"user_id": user_id, "full_name": ""}).execute()


def fetch_customer_profile(user):
    ensure_profile_row(user["id"])
    res = (
        supabase.table("customer_profile")
        .select("full_name, phone_number")
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    row = res.data or {}
    return {
        "fullName": row.get("full_name") or "",
        "email": user.get("email"),
        "phone": row.get("phone_number") or "",
    }


def fetch_customer_orders(user_id):
    res = (
        supabase.table("customer_order")
        .select("*, customer_order_item(*)")
        .eq("user_id", user_id)
        .order("placed_at", desc=True)
        .execute()
    )
    return [map_order(row) for row in res.data or []]


def fetch_customer_rmas(user_id):
    res = (
        supabase.table("customer_rma")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_rma(row) for row in res.data or []]


def fetch_shipping_addresses(user_id):
    res = (
        supabase.table("shipping_address")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_address(row) for row in res.data or []]


def fetch_saved_payments(user_id):
    res = (
        supabase.table("saved_payment_method")
        .select("*")
        .eq("user_id", user_id)
        .order("is_default", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [map_payment(row) for row in res.data or []]


def clear_default_for(table_name, user_id):
    supabase.table(table_name).update({"is_default": False}).eq("user_id", user_id).eq("is_default", True).execute()


def normalize_address_payload(payload):
    required_fields = ["label", "recipient", "line1", "city", "postalCode", "country"]
    for field in required_fields:
        if not (payload.get(field) or "").strip():
            raise ValueError(f"{field} is required")
    return {
        "label": payload["label"].strip(),
        "recipient": payload["recipient"].strip(),
        "line1": payload["line1"].strip(),
        "line2": (payload.get("line2") or "").strip(),
        "city": payload["city"].strip(),
        "postal_code": payload["postalCode"].strip(),
        "country": payload["country"].strip(),
        "phone": (payload.get("phone") or "").strip(),
        "is_default": bool(payload.get("isDefault")),
    }


def build_address_update(payload):
    mapping = {
        "label": "label",
        "recipient": "recipient",
        "line1": "line1",
        "line2": "line2",
        "city": "city",
        "postalCode": "postal_code",
        "country": "country",
        "phone": "phone",
    }
    body = {}
    optional_fields = {"line2", "phone"}
    for key, column in mapping.items():
        if key in payload:
            value = payload[key]
            if isinstance(value, str):
                value = value.strip()
                if not value and key not in optional_fields:
                    raise ValueError(f"{key} cannot be empty")
            body[column] = value
    if "isDefault" in payload:
        body["is_default"] = bool(payload["isDefault"])
    return body


def normalize_payment_payload(payload):
    required_fields = ["brand", "last4", "expiry"]
    for field in required_fields:
        if not (payload.get(field) or "").strip():
            raise ValueError(f"{field} is required")
    last4 = (payload.get("last4") or "").strip()[-4:]
    if len(last4) != 4 or not last4.isdigit():
        raise ValueError("last4 must contain four digits")
    return {
        "brand": payload["brand"].strip(),
        "last4": last4,
        "expiry": payload["expiry"].strip(),
        "nickname": (payload.get("nickname") or "").strip(),
        "is_default": bool(payload.get("isDefault")),
    }


def build_payment_update(payload):
    mapping = {
        "brand": "brand",
        "last4": "last4",
        "expiry": "expiry",
        "nickname": "nickname",
    }
    body = {}
    for key, column in mapping.items():
        if key in payload:
            value = payload[key]
            if isinstance(value, str):
                value = value.strip()
            body[column] = value
    if "last4" in body:
        last4 = body["last4"][-4:]
        if len(last4) != 4 or not last4.isdigit():
            raise ValueError("last4 must contain four digits")
        body["last4"] = last4
    if "isDefault" in payload:
        body["is_default"] = bool(payload["isDefault"])
    return body


def get_customer_dashboard_payload(user):
    return {
        "profile": fetch_customer_profile(user),
        "purchaseHistory": fetch_customer_orders(user["id"]),
        "rmas": fetch_customer_rmas(user["id"]),
        "shippingAddresses": fetch_shipping_addresses(user["id"]),
        "savedPayments": fetch_saved_payments(user["id"]),
    }


def sanitize_user(row):
    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "role": row.get("role"),
    }


def fetch_user_by_id(user_id):
    res = (
        supabase.table("app_user")
        .select("id, email, role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return res.data


def require_customer(user_id):
    user_row = fetch_user_by_id(user_id)
    if not user_row:
        return None, ("User not found", 404)
    if user_row.get("role") != "customer":
        return None, ("Forbidden", 403)
    return user_row, None


def fetch_user_with_password(email):
    res = (
        supabase.table("app_user")
        .select("id, email, role, password_hash")
        .eq("email", email)
        .single()
        .execute()
    )
    return res.data


def password_matches(password, stored_hash):
    return secrets.compare_digest(password or "", stored_hash or "")

def fetch_user_by_email(email):
    res = (
        supabase.table("app_user")
        .select("id, email, role, password_hash")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]
    return None


@app.get("/health")
def health():
    """Simple healthcheck."""
    return jsonify({"status": "ok"})


@app.get("/api/products")
def get_products():
    """List products ordered by created_at desc."""
    try:
        res = (
            supabase.table("products")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify([map_product(r) for r in res.data or []])
    except Exception as err:
        app.logger.error(f"products error: {err}")
        return jsonify({"error": str(err)}), 500


@app.get("/api/products/<product_id>")
def get_product(product_id):
    """Fetch a single product by id."""
    try:
        res = supabase.table("products").select("*").eq("id", product_id).single().execute()
        if not res.data:
            return jsonify({"error": "Not found"}), 404
        return jsonify(map_product(res.data))
    except Exception as err:
        app.logger.error(f"product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/products")
def create_product():
    """Create a new product; requires title and price."""
    try:
        payload = request.get_json(force=True)
        title = payload.get("title")
        price = payload.get("price")
        if not title or price is None:
            return jsonify({"error": "title and price are required"}), 400
        body = {
            "title": title,
            "description": payload.get("description", ""),
            "price": price,
            "image_url": payload.get("image"),
            "category": payload.get("category"),
            "rating": payload.get("rating"),
            "rating_count": payload.get("rating_count"),
            "specs": payload.get("specs") or {},
        }
        res = supabase.table("products").insert(body).execute()
        if not res.data:
             return jsonify({"error": "Failed to create product"}), 500
        return jsonify(map_product(res.data[0])), 201
    except Exception as err:
        app.logger.error(f"create product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/products/<product_id>")
def update_product(product_id):
    """Partial update of a product by id."""
    try:
        payload = request.get_json(force=True)
        body = {}
        for key, field in [
            ("title", "title"),
            ("description", "description"),
            ("price", "price"),
            ("image", "image_url"),
            ("category", "category"),
            ("rating", "rating"),
            ("rating_count", "rating_count"),
            ("specs", "specs"),
        ]:
            if key in payload:
                body[field] = payload[key]
        res = (
            supabase.table("products")
            .update(body)
            .eq("id", product_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Failed to update product"}), 500
        return jsonify(map_product(res.data[0]))
    except Exception as err:
        app.logger.error(f"update product error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/carts")
def create_cart():
    """Create an empty cart and return its id."""
    try:
        res = supabase.table("carts").insert({}).execute()
        if not res.data:
            return jsonify({"error": "Failed to create cart"}), 500
        return jsonify({"cartId": res.data[0].get("id")}), 201
    except Exception as err:
        app.logger.error(f"create cart error: {err}")
        return jsonify({"error": str(err)}), 500


@app.get("/api/carts/<cart_id>")
def get_cart(cart_id):
    """Return cart items for a given cart id (404 if not found)."""
    try:
        res = supabase.table("carts").select("id").eq("id", cart_id).single().execute()
        if not res.data:
            return jsonify({"error": "Cart not found"}), 404
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"get cart error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/carts/<cart_id>/items")
def add_cart_item(cart_id):
    """Upsert a cart item (add or bump quantity)."""
    try:
        payload = request.get_json(force=True)
        product_id = payload.get("product_id")
        quantity = payload.get("quantity", 1)
        if not product_id:
            return jsonify({"error": "product_id is required"}), 400
        if quantity < 1:
            return jsonify({"error": "quantity must be >= 1"}), 400
        supabase.table("cart_items").upsert(
            {"cart_id": cart_id, "product_id": product_id, "quantity": quantity},
            on_conflict="cart_id,product_id",
        ).execute()
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items}), 201
    except Exception as err:
        app.logger.error(f"add cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@app.patch("/api/carts/<cart_id>/items/<product_id>")
def update_cart_item(cart_id, product_id):
    """Update quantity for a specific product in the cart."""
    try:
        payload = request.get_json(force=True)
        quantity = payload.get("quantity")
        if quantity is None:
            return jsonify({"error": "quantity is required"}), 400
        if quantity < 1:
            return jsonify({"error": "quantity must be >= 1"}), 400
        supabase.table("cart_items").update({"quantity": quantity}).eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"update cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@app.delete("/api/carts/<cart_id>/items/<product_id>")
def delete_cart_item(cart_id, product_id):
    """Remove a product from the cart."""
    try:
        supabase.table("cart_items").delete().eq("cart_id", cart_id).eq("product_id", product_id).execute()
        items = map_cart_items(cart_id)
        return jsonify({"cartId": cart_id, "items": items})
    except Exception as err:
        app.logger.error(f"delete cart item error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/auth/login")
def login():
    """Basic email/password auth that returns the user's role."""
    try:
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password")
        if not email or not password:
            return jsonify({"error": "email and password are required"}), 400

        user_row = fetch_user_with_password(email)
        if not user_row or not password_matches(password, user_row.get("password_hash")):
            return jsonify({"error": "Invalid email or password"}), 401

        user = sanitize_user(user_row)
        profile_data = fetch_customer_profile(user)
        user["fullName"] = profile_data.get("fullName") or user.get("email")
        if user["role"] != "customer":
            return jsonify({"error": "Admin dashboard is coming soon. Customer logins only for now."}), 403
        redirect_to = "/dashboard/customer"
        return jsonify({"user": user, "redirectTo": redirect_to})
    except Exception as err:
        app.logger.error(f"login error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/auth/register")
def register():
    """Create a new customer account and return the session payload."""
    try:
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        full_name = (payload.get("fullName") or "").strip()
        if not email or not password:
            return jsonify({"error": "email and password are required"}), 400

        existing = fetch_user_by_email(email)
        if existing:
            return jsonify({"error": "Email is already registered"}), 409

        res = (
            supabase.table("app_user")
            .insert({"email": email, "password_hash": password, "role": "customer"})
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Failed to create user"}), 500
        user_row = res.data[0]

        # Ensure a profile row exists for the new customer
        try:
            supabase.table("customer_profile").upsert(
                {
                    "user_id": user_row["id"],
                    "full_name": full_name,
                },
                on_conflict="user_id",
            ).execute()
        except Exception as err:
            app.logger.warning(f"register profile upsert failed: {err}")

        user = {
            "id": user_row.get("id"),
            "email": user_row.get("email"),
            "role": "customer",
            "fullName": full_name or email,
        }
        return jsonify({"user": user, "redirectTo": "/dashboard/customer"}), 201
    except Exception as err:
        app.logger.error(f"register error: {err}")
        return jsonify({"error": str(err)}), 500


@app.get("/api/dashboard/customer/<user_id>")
def customer_dashboard(user_id):
    """Return role-scoped dashboard data for customer accounts."""
    try:
        user_row, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code

        section = (request.args.get("section") or "all").lower()
        fetchers = {
            "profile": ("profile", lambda: fetch_customer_profile(user_row)),
            "payments": ("savedPayments", lambda: fetch_saved_payments(user_row["id"])),
            "shipping": ("shippingAddresses", lambda: fetch_shipping_addresses(user_row["id"])),
            "orders": ("purchaseHistory", lambda: fetch_customer_orders(user_row["id"])),
            "rmas": ("rmas", lambda: fetch_customer_rmas(user_row["id"])),
        }

        if section == "all":
            data = {}
            for _, (key, getter) in fetchers.items():
                data[key] = getter()
            return jsonify(data)

        if section in fetchers:
            key, getter = fetchers[section]
            return jsonify({key: getter()})

        return jsonify({"error": "Invalid section"}), 400
    except Exception as err:
        app.logger.error(f"customer dashboard error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/customer/profile/<user_id>")
def update_customer_profile(user_id):
    """Update name/email/phone for a customer."""
    try:
        user_row, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        payload = request.get_json(force=True)
        full_name = (payload.get("fullName") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        phone = (payload.get("phone") or "").strip()
        if not full_name:
            return jsonify({"error": "fullName is required"}), 400
        if not email:
            return jsonify({"error": "email is required"}), 400

        supabase.table("app_user").update({"email": email}).eq("id", user_id).execute()
        profile_body = {
            "user_id": user_id,
            "full_name": full_name,
            "phone_number": phone,
            "updated_at": datetime.utcnow().isoformat(),
        }
        supabase.table("customer_profile").upsert(profile_body, on_conflict="user_id").execute()
        user_row["email"] = email
        profile = fetch_customer_profile(user_row)
        return jsonify(profile)
    except Exception as err:
        app.logger.error(f"update profile error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/customer/password/<user_id>")
def update_customer_password(user_id):
    """Change customer password after validating the current password."""
    try:
        user_row, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        payload = request.get_json(force=True)
        current_password = payload.get("currentPassword")
        new_password = payload.get("newPassword")
        confirm_password = payload.get("confirmPassword")
        if not current_password or not new_password:
            return jsonify({"error": "currentPassword and newPassword are required"}), 400
        if new_password != confirm_password:
            return jsonify({"error": "Passwords do not match"}), 400

        user_with_password = fetch_user_with_password(user_row["email"])
        if not password_matches(current_password, user_with_password.get("password_hash")):
            return jsonify({"error": "Current password is incorrect"}), 400

        supabase.table("app_user").update({"password_hash": new_password}).eq("id", user_id).execute()
        return jsonify({"status": "updated"})
    except Exception as err:
        app.logger.error(f"update password error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/customer/addresses/<user_id>")
def create_address(user_id):
    try:
        user_row, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = normalize_address_payload(request.get_json(force=True))
        body["user_id"] = user_row["id"]
        if body.get("is_default"):
            clear_default_for("shipping_address", user_row["id"])
        res = supabase.table("shipping_address").insert(body).execute()
        if not res.data:
            return jsonify({"error": "Failed to create address"}), 500
        return jsonify(map_address(res.data[0])), 201
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.error(f"create address error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/customer/addresses/<user_id>/<address_id>")
def update_address(user_id, address_id):
    try:
        _, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = build_address_update(request.get_json(force=True))
        if not body:
            return jsonify({"error": "No fields to update"}), 400
        if body.get("is_default"):
            clear_default_for("shipping_address", user_id)
        res = (
            supabase.table("shipping_address")
            .update(body)
            .eq("user_id", user_id)
            .eq("id", address_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Address not found"}), 404
        return jsonify(map_address(res.data[0]))
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.error(f"update address error: {err}")
        return jsonify({"error": str(err)}), 500


@app.delete("/api/customer/addresses/<user_id>/<address_id>")
def delete_address(user_id, address_id):
    try:
        _, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        res = (
            supabase.table("shipping_address")
            .delete()
            .eq("user_id", user_id)
            .eq("id", address_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Address not found"}), 404
        return jsonify({"status": "deleted"})
    except Exception as err:
        app.logger.error(f"delete address error: {err}")
        return jsonify({"error": str(err)}), 500


@app.post("/api/customer/payments/<user_id>")
def create_payment(user_id):
    try:
        user_row, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = normalize_payment_payload(request.get_json(force=True))
        body["user_id"] = user_row["id"]
        if body.get("is_default"):
            clear_default_for("saved_payment_method", user_row["id"])
        res = supabase.table("saved_payment_method").insert(body).execute()
        if not res.data:
            return jsonify({"error": "Failed to create payment method"}), 500
        return jsonify(map_payment(res.data[0])), 201
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.error(f"create payment error: {err}")
        return jsonify({"error": str(err)}), 500


@app.put("/api/customer/payments/<user_id>/<payment_id>")
def update_payment(user_id, payment_id):
    try:
        _, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = build_payment_update(request.get_json(force=True))
        if not body:
            return jsonify({"error": "No fields to update"}), 400
        if body.get("is_default"):
            clear_default_for("saved_payment_method", user_id)
        res = (
            supabase.table("saved_payment_method")
            .update(body)
            .eq("user_id", user_id)
            .eq("id", payment_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Payment method not found"}), 404
        return jsonify(map_payment(res.data[0]))
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        app.logger.error(f"update payment error: {err}")
        return jsonify({"error": str(err)}), 500


@app.delete("/api/customer/payments/<user_id>/<payment_id>")
def delete_payment(user_id, payment_id):
    try:
        _, error = require_customer(user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        res = (
            supabase.table("saved_payment_method")
            .delete()
            .eq("user_id", user_id)
            .eq("id", payment_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Payment method not found"}), 404
        return jsonify({"status": "deleted"})
    except Exception as err:
        app.logger.error(f"delete payment error: {err}")
        return jsonify({"error": str(err)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4000"))
    app.run(host="0.0.0.0", port=port)
