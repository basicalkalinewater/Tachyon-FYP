import functools
from typing import Iterable, Optional

from flask import current_app, g, jsonify, request

from ..services import session_service


def _extract_token() -> str:
    """Pull a bearer token from Authorization header or ?token= query param."""
    header = (request.headers.get("Authorization") or "").strip()
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    token = request.args.get("token") or ""
    return token.strip()


def require_session(allowed_roles: Optional[Iterable[str]] = None, match_user_param: Optional[str] = None):
    """Decorator to enforce server-side sessions and optional role/user matching."""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            supabase = current_app.config["SUPABASE"]
            token = _extract_token()
            if not token:
                return jsonify({"error": "Missing session token"}), 401

            session_row, err = session_service.get_session(supabase, token)
            if err:
                return jsonify({"error": err}), 401

            user_id = session_row.get("user_id")
            user_res = (
                supabase.table("app_user")
                .select("id, email, role")
                .eq("id", user_id)
                .single()
                .execute()
            )
            user = user_res.data if user_res and hasattr(user_res, "data") else None
            if not user:
                return jsonify({"error": "User not found"}), 404

            if allowed_roles and user.get("role") not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403

            if match_user_param:
                param_val = kwargs.get(match_user_param)
                if param_val and str(param_val) != str(user.get("id")):
                    return jsonify({"error": "Forbidden"}), 403

            g.current_user = user
            g.current_session = session_row
            return fn(*args, **kwargs)

        return wrapper

    return decorator
