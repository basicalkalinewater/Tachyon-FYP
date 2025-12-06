"""
Flask REST API entrypoint. Wires blueprints by domain and shares a single Supabase client.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from .supabase_client import get_supabase
from .routes.live_cust_support import live_cust_support_bp
from .routes.products import products_bp
from .routes.carts import carts_bp
from .routes.auth import auth_bp
from .routes.customer import customer_bp, dashboard_bp
from .routes.admin_user_management import admin_users_bp


def create_app() -> Flask:
    # Load .env at repo root (one level above backend/)
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    app = Flask(__name__)
    # Avoid redirecting /path to /path/ which breaks CORS preflights
    app.url_map.strict_slashes = False
    CORS(app)

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
