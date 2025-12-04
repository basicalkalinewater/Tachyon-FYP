from flask import Blueprint, current_app, jsonify, request

from ..services import customer_service
from ..services import live_cust_support_service


def fetch_agent_profile(supabase, user_id: str):
    """Fetch support agent profile (full_name) from live_agent_profile."""
    try:
        res = (
            supabase.table("live_agent_profile")
            .select("full_name")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return res.data or {}
    except Exception:
        return {}

# Blueprint for auth endpoints; registered under /api/auth
auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    # Basic email/password login; returns user info and redirect target
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password")

        if not email or not password:
            return jsonify({"error": "email and password are required"}), 400

        user_row = customer_service.fetch_user_with_password(supabase, email)
        if not user_row or not customer_service.password_matches(password, user_row.get("password_hash")):
            return jsonify({"error": "Invalid email or password"}), 401

        user = customer_service.sanitize_user(user_row)

        role = user.get("role")

        if role == "customer":
            profile_data = customer_service.fetch_customer_profile(supabase, user)
            user["fullName"] = profile_data.get("fullName") or user.get("email")
        elif role == "support":
            profile_data = fetch_agent_profile(supabase, user.get("id"))
            user["fullName"] = (profile_data.get("full_name") or "").strip() or user.get("email")
        else:
            user["fullName"] = user.get("fullName") or user.get("email")

        if role == "customer":
            redirect_to = "/dashboard/customer"
        elif role == "support":
            redirect_to = "/dashboard/support"
        else:
            return jsonify({"error": "Admin dashboard coming soon."}), 403

        return jsonify({"user": user, "redirectTo": redirect_to})

    except Exception as err:
        current_app.logger.error(f"login error: {err}")
        return jsonify({"error": str(err)}), 500


@auth_bp.post("/register")
def register():
    # Register a new customer and return session payload
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        full_name = (payload.get("fullName") or "").strip()
        if not email or not password:
            return jsonify({"error": "email and password are required"}), 400

        existing = customer_service.fetch_user_by_email(supabase, email)
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

        try:
            supabase.table("customer_profile").upsert(
                {
                    "user_id": user_row["id"],
                    "full_name": full_name,
                },
                on_conflict="user_id",
            ).execute()
        except Exception as err:
            current_app.logger.warning(f"register profile upsert failed: {err}")

        user = {
            "id": user_row.get("id"),
            "email": user_row.get("email"),
            "role": "customer",
            "fullName": full_name or email,
        }
        return jsonify({"user": user, "redirectTo": "/dashboard/customer"}), 201
    except Exception as err:
        current_app.logger.error(f"register error: {err}")
        return jsonify({"error": str(err)}), 500


@auth_bp.post("/profile/update")
def update_profile():
    """Allow an agent to update email/password and display name."""
    supabase = current_app.config["SUPABASE"]
    try:
        payload = request.get_json(force=True) or {}
        user_id = payload.get("user_id")
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password")
        full_name = (payload.get("fullName") or "").strip()

        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        updates = {}
        if email:
            updates["email"] = email
        if password:
            updates["password_hash"] = password

        if updates:
            res = supabase.table("app_user").update(updates).eq("id", user_id).execute()
            if res.error:
                return jsonify({"error": res.error.get("message", "Failed to update user")}), 400

        if full_name:
            supabase.table("live_agent_profile").upsert(
                {"user_id": user_id, "full_name": full_name},
                on_conflict="user_id",
            ).execute()

        profile_data = {}
        if full_name:
            profile_data["fullName"] = full_name
        if email:
            profile_data["email"] = email

        return jsonify({"success": True, "data": profile_data})
    except Exception as err:
        current_app.logger.error(f"profile update error: {err}")
        return jsonify({"error": str(err)}), 500
