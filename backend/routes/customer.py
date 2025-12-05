from datetime import datetime
from flask import Blueprint, current_app, jsonify, request

from ..services import customer_service
from ..services.customer_service import (
    normalize_address_payload,
    build_address_update,
    normalize_payment_payload,
    build_payment_update,
)
from ..utils.mappers import map_address, map_payment
from ..utils.auth_middleware import require_session

customer_bp = Blueprint("customer", __name__)
dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/customer/<user_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def customer_dashboard(user_id):
    """Return role-scoped dashboard data for customer accounts."""
    supabase = current_app.config["SUPABASE"]
    try:
        user_row, error = customer_service.require_customer(supabase, user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code

        section = (request.args.get("section") or "all").lower()
        fetchers = {
            "profile": ("profile", lambda: customer_service.fetch_customer_profile(supabase, user_row)),
            "payments": ("savedPayments", lambda: customer_service.fetch_saved_payments(supabase, user_row["id"])),
            "shipping": ("shippingAddresses", lambda: customer_service.fetch_shipping_addresses(supabase, user_row["id"])),
            "orders": ("purchaseHistory", lambda: customer_service.fetch_customer_orders(supabase, user_row["id"])),
            "rmas": ("rmas", lambda: customer_service.fetch_customer_rmas(supabase, user_row["id"])),
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
        current_app.logger.error(f"customer dashboard error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.put("/profile/<user_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def update_customer_profile(user_id):
    """Update name/email/phone for a customer."""
    supabase = current_app.config["SUPABASE"]
    try:
        user_row, error = customer_service.require_customer(supabase, user_id)
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
        profile = customer_service.fetch_customer_profile(supabase, user_row)
        return jsonify(profile)
    except Exception as err:
        current_app.logger.error(f"update profile error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.put("/password/<user_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def update_customer_password(user_id):
    """Change customer password after validating the current password."""
    supabase = current_app.config["SUPABASE"]
    try:
        user_row, error = customer_service.require_customer(supabase, user_id)
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

        user_with_password = customer_service.fetch_user_with_password(supabase, user_row["email"])
        if not customer_service.password_matches(current_password, user_with_password.get("password_hash")):
            return jsonify({"error": "Current password is incorrect"}), 400

        supabase.table("app_user").update({"password_hash": new_password}).eq("id", user_id).execute()
        return jsonify({"status": "updated"})
    except Exception as err:
        current_app.logger.error(f"update password error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.post("/addresses/<user_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def create_address(user_id):
    supabase = current_app.config["SUPABASE"]
    try:
        user_row, error = customer_service.require_customer(supabase, user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = normalize_address_payload(request.get_json(force=True))
        body["user_id"] = user_row["id"]
        if body.get("is_default"):
            customer_service.clear_default_for(supabase, "shipping_address", user_row["id"])
        res = supabase.table("shipping_address").insert(body).execute()
        if not res.data:
            return jsonify({"error": "Failed to create address"}), 500
        return jsonify(map_address(res.data[0])), 201
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        current_app.logger.error(f"create address error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.put("/addresses/<user_id>/<address_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def update_address(user_id, address_id):
    supabase = current_app.config["SUPABASE"]
    try:
        _, error = customer_service.require_customer(supabase, user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = build_address_update(request.get_json(force=True))
        if not body:
            return jsonify({"error": "No fields to update"}), 400
        if body.get("is_default"):
            customer_service.clear_default_for(supabase, "shipping_address", user_id)
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
        current_app.logger.error(f"update address error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.delete("/addresses/<user_id>/<address_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def delete_address(user_id, address_id):
    supabase = current_app.config["SUPABASE"]
    try:
        _, error = customer_service.require_customer(supabase, user_id)
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
        current_app.logger.error(f"delete address error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.post("/payments/<user_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def create_payment(user_id):
    supabase = current_app.config["SUPABASE"]
    try:
        user_row, error = customer_service.require_customer(supabase, user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = normalize_payment_payload(request.get_json(force=True))
        body["user_id"] = user_row["id"]
        if body.get("is_default"):
            customer_service.clear_default_for(supabase, "saved_payment_method", user_row["id"])
        res = supabase.table("saved_payment_method").insert(body).execute()
        if not res.data:
            return jsonify({"error": "Failed to create payment method"}), 500
        return jsonify(map_payment(res.data[0])), 201
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    except Exception as err:
        current_app.logger.error(f"create payment error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.put("/payments/<user_id>/<payment_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def update_payment(user_id, payment_id):
    supabase = current_app.config["SUPABASE"]
    try:
        _, error = customer_service.require_customer(supabase, user_id)
        if error:
            message, code = error
            return jsonify({"error": message}), code
        body = build_payment_update(request.get_json(force=True))
        if not body:
            return jsonify({"error": "No fields to update"}), 400
        if body.get("is_default"):
            customer_service.clear_default_for(supabase, "saved_payment_method", user_id)
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
        current_app.logger.error(f"update payment error: {err}")
        return jsonify({"error": str(err)}), 500


@customer_bp.delete("/payments/<user_id>/<payment_id>")
@require_session(allowed_roles=["customer"], match_user_param="user_id")
def delete_payment(user_id, payment_id):
    supabase = current_app.config["SUPABASE"]
    try:
        _, error = customer_service.require_customer(supabase, user_id)
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
        current_app.logger.error(f"delete payment error: {err}")
        return jsonify({"error": str(err)}), 500
