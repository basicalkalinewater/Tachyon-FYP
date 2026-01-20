"""
Flask REST API entrypoint. Wires blueprints by domain and shares a single Supabase client.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
# Use package-relative import with fallback for local runs.
try:
    from .limiter import init_limiter
except ImportError:
    from limiter import init_limiter

# Support both execution styles:
# - `flask --app server` from inside backend/ (imports as top-level module)
# - `flask --app backend.server` or gunicorn from project root (package import)
try:  # package-relative (preferred)
    from .supabase_client import get_supabase
    from .routes.live_cust_support import live_cust_support_bp
    from .routes.products import products_bp
    from .routes.carts import carts_bp
    from .routes.auth import auth_bp
    from .routes.customer import customer_bp, dashboard_bp
    from .routes.admin_user_management import admin_users_bp
except ImportError:  # fallback for top-level module import
    from supabase_client import get_supabase
    from routes.live_cust_support import live_cust_support_bp
    from routes.products import products_bp
    from routes.carts import carts_bp
    from routes.auth import auth_bp
    from routes.customer import customer_bp, dashboard_bp
    from routes.admin_user_management import admin_users_bp


def create_app() -> Flask:
    # Load .env at repo root (one level above backend/)
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    app = Flask(__name__)
    # Avoid redirecting /path to /path/ which breaks CORS preflights
    app.url_map.strict_slashes = False
    # Allow the frontend origin (Render static site) and others during development.
    CORS(
        app,
        resources={r"/*": {"origins": "*"}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    @app.after_request
    def add_cors_headers(resp):
        # Force CORS headers on all responses, including errors, to satisfy browser preflights.
        resp.headers["Access-Control-Allow-Origin"] = os.getenv("CORS_ALLOWED_ORIGINS", "*")
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        return resp

    @app.route("/__options__", methods=["OPTIONS"])
    def options_probe():
        """Explicit OPTIONS responder to help diagnose CORS."""
        resp = make_response("", 204)
        return resp

    # Rate limiting
    limiter = init_limiter(app)
    app.config["LIMITER"] = limiter

    supabase = get_supabase()
    app.config["SUPABASE"] = supabase

    # Blueprints by function/domain
    app.register_blueprint(live_cust_support_bp, url_prefix="/support")
    app.register_blueprint(products_bp, url_prefix="/api/products")
    app.register_blueprint(carts_bp, url_prefix="/api/carts")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(customer_bp, url_prefix="/api/customer")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(admin_users_bp, url_prefix="/api/admin")

    @app.get("/health")
    def health():
        """Simple healthcheck."""
        return jsonify({"status": "ok"})

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4000"))
    app = create_app()
    app.run(host="0.0.0.0", port=port)
