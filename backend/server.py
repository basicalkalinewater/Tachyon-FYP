import os
import logging
import traceback
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# 1. IMPORT BLUEPRINTS
try:
    from .supabase_client import get_supabase
    from .routes.stocks import stocks_bp
    from .routes.products import products_bp
    from .routes.carts import carts_bp
    from .routes.auth import auth_bp
    from .routes.admin_analytics import admin_analytics_bp
    from .routes.admin_content import admin_content_bp
    from .routes.content import content_bp
    from .routes.admin_promotions import admin_promotions_bp
    from .routes.admin_promos import admin_promos_bp
    from .routes.admin_user_management import admin_users_bp
    from .routes.customer import customer_bp, dashboard_bp
    from .routes.live_cust_support import live_cust_support_bp
    from .routes.promos import promos_bp
    from .routes.product_categories import product_categories_bp, admin_product_categories_bp
    from .routes.product_reviews import product_reviews_bp
    from .routes.llm import llm_bp
    # Import other blueprints as needed
except ImportError:
    from supabase_client import get_supabase
    from routes.stocks import stocks_bp
    from routes.products import products_bp
    from routes.carts import carts_bp
    from routes.auth import auth_bp
    from routes.admin_analytics import admin_analytics_bp
    from routes.admin_content import admin_content_bp
    from routes.content import content_bp
    from routes.admin_promotions import admin_promotions_bp
    from routes.admin_promos import admin_promos_bp
    from routes.admin_user_management import admin_users_bp
    from routes.customer import customer_bp, dashboard_bp
    from routes.live_cust_support import live_cust_support_bp
    from routes.promos import promos_bp
    from routes.product_categories import product_categories_bp, admin_product_categories_bp
    from routes.product_reviews import product_reviews_bp
    from routes.llm import llm_bp

def create_app() -> Flask:
    # 2. ENV LOADING (Force absolute path to avoid 500s from missing keys)
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    app = Flask(__name__)
    app.url_map.strict_slashes = False
    
    # 3. CORS CONFIGURATION (Fixes 401 Unauthorized)
    allowed_origin = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    CORS(
        app,
        resources={r"/*": {"origins": [allowed_origin]}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # 4. EXPLICIT PREFLIGHT HANDLER
    @app.before_request
    def handle_preflight():
        if request.method.upper() == 'OPTIONS':
            res = make_response()
            res.headers.add("Access-Control-Allow-Origin", allowed_origin)
            res.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With")
            res.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE,OPTIONS")
            res.headers.add("Access-Control-Allow-Credentials", "true")
            return res, 200

    # 5. GLOBAL ERROR HANDLER (Ensures you see the REAL error, not a CORS block)
    @app.errorhandler(Exception)
    def handle_exception(e):
        if isinstance(e, HTTPException):
            response = e.get_response()
            response.headers["Access-Control-Allow-Origin"] = allowed_origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response
        logging.error(f"!!! SERVER ERROR !!!\n{traceback.format_exc()}")
        response = jsonify({
            "error": "Internal Server Error",
            "message": str(e),
            "route": request.path
        })
        response.status_code = 500
        response.headers["Access-Control-Allow-Origin"] = allowed_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    # 6. DATABASE INIT
    supabase = get_supabase()
    app.config["SUPABASE"] = supabase

    # 7. BLUEPRINT REGISTRATION (Aligned to your Frontend logs)
    # ------------------------------------------------------------------
    
    # Auth & Storefront
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(products_bp, url_prefix="/api/products")
    app.register_blueprint(carts_bp, url_prefix="/api/carts")
    app.register_blueprint(promos_bp, url_prefix="/api/promo-codes")
    app.register_blueprint(product_categories_bp, url_prefix="/api/product-categories")
    app.register_blueprint(product_reviews_bp, url_prefix="/api")
    app.register_blueprint(llm_bp, url_prefix="/api/llm")
    
    # Admin Routes
    app.register_blueprint(stocks_bp, url_prefix="/api/admin/stocks")
    
    app.register_blueprint(admin_analytics_bp, url_prefix="/api/admin")
    app.register_blueprint(admin_content_bp, url_prefix="/api/admin")
    app.register_blueprint(content_bp, url_prefix="/api/content")
    app.register_blueprint(admin_promotions_bp, url_prefix="/api/admin")
    app.register_blueprint(admin_promos_bp, url_prefix="/api/admin")
    app.register_blueprint(admin_users_bp, url_prefix="/api/admin")
    app.register_blueprint(admin_product_categories_bp, url_prefix="/api/admin")

    # Customer Dashboard & Profile
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(customer_bp, url_prefix="/api/customer")

    # Support
    app.register_blueprint(live_cust_support_bp, url_prefix="/support")

    @app.get("/health")
    def health():
        return jsonify({
            "status": "online",
            "supabase_ok": app.config["SUPABASE"] is not None
        })

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=4000, debug=True)
