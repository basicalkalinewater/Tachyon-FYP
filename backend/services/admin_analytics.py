from datetime import datetime, timedelta
from typing import Dict, List


def _start_end_today_utc():
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _start_end_month_utc():
    now = datetime.utcnow()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start.isoformat(), end.isoformat()


def _aggregate_product_sales(items: List[Dict]) -> Dict[str, Dict]:
    totals: Dict[str, Dict] = {}
    for row in items:
        name = row.get("product_name") or ""
        if not name:
            continue
        qty = int(row.get("quantity") or 0)
        price = float(row.get("unit_price") or 0)
        entry = totals.setdefault(name, {"name": name, "quantity": 0, "revenue": 0.0})
        entry["quantity"] += qty
        entry["revenue"] += qty * price
    return totals


def _pick_best_worst(product_totals: Dict[str, Dict]):
    if not product_totals:
        return None, None
    products = list(product_totals.values())
    best = max(products, key=lambda p: p["quantity"])
    worst = min(products, key=lambda p: p["quantity"])
    return best, worst


def fetch_business_insights(supabase) -> Dict:
    month_start, month_end = _start_end_month_utc()
    orders_month_res = (
        supabase.table("customer_order")
        .select("id")
        .gte("placed_at", month_start)
        .lt("placed_at", month_end)
        .execute()
    )
    orders_month = orders_month_res.data or []
    order_ids = [row.get("id") for row in orders_month if row.get("id")]

    month_items = []
    if order_ids:
        items_res = (
            supabase.table("customer_order_item")
            .select("product_name, quantity, unit_price")
            .in_("order_id", order_ids)
            .execute()
        )
        month_items = items_res.data or []

    month_totals = _aggregate_product_sales(month_items)
    best_month, worst_month = _pick_best_worst(month_totals)

    today_start, today_end = _start_end_today_utc()
    orders_today_res = (
        supabase.table("customer_order")
        .select("total, placed_at")
        .gte("placed_at", today_start)
        .lt("placed_at", today_end)
        .execute()
    )
    orders_today = orders_today_res.data or []
    total_sales_today = sum(float(o.get("total") or 0) for o in orders_today)

    return {
        "best_selling_product_month": best_month,
        "worst_selling_product_month": worst_month,
        "total_sales_today": round(total_sales_today, 2),
        "orders_today": len(orders_today),
    }
