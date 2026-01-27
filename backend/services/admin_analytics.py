from datetime import datetime, timedelta
from typing import Dict, List


def _start_end_today_utc():
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _start_end_month_utc(year: int, month: int):
    start = datetime(year, month, 1).replace(hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start.isoformat(), end.isoformat()


def _iter_months_back(count: int, end_year: int, end_month: int) -> List[Dict]:
    months: List[Dict] = []
    year = end_year
    month = end_month
    for _ in range(max(count, 0)):
        months.append({"year": year, "month": month})
        month -= 1
        if month < 1:
            month = 12
            year -= 1
    return months


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


def _compute_month_insights(supabase, year: int, month: int) -> Dict:
    month_start, month_end = _start_end_month_utc(year, month)
    orders_month_res = (
        supabase.table("customer_order")
        .select("id, total")
        .gte("placed_at", month_start)
        .lt("placed_at", month_end)
        .execute()
    )
    orders_month = orders_month_res.data or []
    order_ids = [row.get("id") for row in orders_month if row.get("id")]
    month_total_sales = sum(float(row.get("total") or 0) for row in orders_month)

    month_items: List[Dict] = []
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

    return {
        "best": best_month,
        "worst": worst_month,
        "month_total_sales": round(month_total_sales, 2),
        "orders_count": len(orders_month),
    }


def _save_snapshot(supabase, year: int, month: int, best, worst, month_total_sales: float, orders_count: int):
    payload = {
        "year": year,
        "month": month,
        "best_product_name": best.get("name") if best else None,
        "best_product_qty": best.get("quantity") if best else None,
        "worst_product_name": worst.get("name") if worst else None,
        "worst_product_qty": worst.get("quantity") if worst else None,
        "total_sales": round(month_total_sales, 2),
        "orders_count": orders_count,
        "computed_at": datetime.utcnow().isoformat(),
    }
    supabase.table("business_insights_monthly").upsert(payload, on_conflict="year,month").execute()


def fetch_backup_insights(supabase, year: int, month: int) -> Dict:
    res = supabase.table("business_insights_monthly").select("*").eq("year", year).eq("month", month).single().execute()
    row = res.data or {}
    return {
        "best_selling_product_month": {
            "name": row.get("best_product_name"),
            "quantity": row.get("best_product_qty"),
        } if row.get("best_product_name") else None,
        "worst_selling_product_month": {
            "name": row.get("worst_product_name"),
            "quantity": row.get("worst_product_qty"),
        } if row.get("worst_product_name") else None,
        "total_sales_today": 0,
        "orders_today": 0,
        "snapshot_year": row.get("year"),
        "snapshot_month": row.get("month"),
        "snapshot_total_sales": row.get("total_sales") or 0,
        "snapshot_orders": row.get("orders_count") or 0,
    }


def fetch_business_insights(supabase, year: int = None, month: int = None) -> Dict:
    now = datetime.utcnow()
    year = year or now.year
    month = month or now.month
    month_stats = _compute_month_insights(supabase, year, month)
    best_month = month_stats["best"]
    worst_month = month_stats["worst"]
    month_total_sales = month_stats["month_total_sales"]
    month_orders_count = month_stats["orders_count"]

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

    try:
        _save_snapshot(supabase, year, month, best_month, worst_month, month_total_sales, month_orders_count)
    except Exception:
        pass

    return {
        "best_selling_product_month": best_month,
        "worst_selling_product_month": worst_month,
        "month_total_sales": month_total_sales,
        "month_orders": month_orders_count,
        "total_sales_today": round(total_sales_today, 2),
        "orders_today": len(orders_today),
        "month": month,
        "year": year,
    }


def fetch_business_insights_history(
    supabase,
    months: int = 13,
    year: int = None,
    month: int = None,
) -> Dict:
    now = datetime.utcnow()
    target_year = year or now.year
    target_month = month or now.month

    if year and not month:
        months_to_fetch = [{"year": target_year, "month": m} for m in range(12, 0, -1)]
    else:
        months_to_fetch = _iter_months_back(months, target_year, target_month)

    rows: List[Dict] = []
    for ym in months_to_fetch:
        y = ym["year"]
        m = ym["month"]
        stats = _compute_month_insights(supabase, y, m)
        rows.append(
            {
                "year": y,
                "month": m,
                "best_selling_product_month": stats["best"],
                "worst_selling_product_month": stats["worst"],
                "month_total_sales": stats["month_total_sales"],
                "month_orders": stats["orders_count"],
            }
        )

    return {
        "months": rows,
        "mode": "year" if year and not month else "rolling",
        "requested_year": year,
        "requested_month": month,
    }
