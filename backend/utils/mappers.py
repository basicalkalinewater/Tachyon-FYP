def map_product(row):
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "brand": row.get("Brand"),  # Accesses the DB "Brand" column
        "description": row.get("description"),
        "price": float(row.get("price", 0)),
        "image": row.get("image_url"), # This is the path like /assets/products/filename.jpg
        "category": row.get("category"),
        "specs": row.get("specs") or {},
        "rating": float(row.get("rating_avg") or row.get("rating") or 0),
        "ratingCount": int(row.get("rating_count") or 0),
        "isBestseller": bool(row.get("is_bestseller") or False),
    }


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
                "productId": item.get("product_id"),
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
