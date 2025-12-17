from typing import List, Dict, Any
from utils.mappers import map_product


def map_cart_items(supabase, cart_id: str) -> List[Dict[str, Any]]:
    """
    Fetch cart items with joined product rows and normalize the shape.
    Raises on Supabase errors so the caller can return a 500 with the message.
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
