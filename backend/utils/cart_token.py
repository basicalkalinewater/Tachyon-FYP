import hashlib
import hmac
import os


def _secret() -> str:
    return (
        os.getenv("CART_TOKEN_SECRET")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or "tachyon-cart-token-fallback"
    )


def sign_cart_token(user_id: str, cart_id: str) -> str:
    message = f"{user_id}:{cart_id}".encode("utf-8")
    digest = hmac.new(_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()
    return digest


def verify_cart_token(user_id: str, cart_id: str, token: str) -> bool:
    if not token:
        return False
    expected = sign_cart_token(user_id, cart_id)
    return hmac.compare_digest(expected, token.strip())
