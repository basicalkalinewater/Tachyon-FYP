from typing import Dict, List


def _normalize_policies_order(supabase, slug: str) -> None:
    if not slug:
        return
    res = (
        supabase.table("policies")
        .select("id, sort_order, created_at")
        .eq("slug", slug)
        .order("sort_order")
        .order("created_at")
        .execute()
    )
    rows = res.data or []
    for idx, row in enumerate(rows, start=1):
        current = int(row.get("sort_order") or 0)
        if current != idx:
            supabase.table("policies").update({"sort_order": idx}).eq("id", row.get("id")).execute()


def _normalize_faqs_order(supabase) -> None:
    res = (
        supabase.table("faqs")
        .select("id, sort_order, created_at")
        .order("sort_order")
        .order("created_at")
        .execute()
    )
    rows = res.data or []
    for idx, row in enumerate(rows, start=1):
        current = int(row.get("sort_order") or 0)
        if current != idx:
            supabase.table("faqs").update({"sort_order": idx}).eq("id", row.get("id")).execute()


def list_faqs(supabase) -> List[Dict]:
    res = supabase.table("faqs").select("*").order("sort_order").order("created_at", desc=True).execute()
    return res.data or []


def list_policies(supabase) -> List[Dict]:
    res = supabase.table("policies").select("*").order("sort_order").order("created_at", desc=True).execute()
    return res.data or []

def get_announcement(supabase) -> Dict:
    res = (
        supabase.table("announcement_banner")
        .select("*")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    return (res.data or [{}])[0]

def upsert_announcement(supabase, payload: Dict) -> Dict:
    announcement_id = payload.get("id")
    body = {
        "message": payload.get("message") or "",
        "link_url": payload.get("link_url") or None,
        "link_label": payload.get("link_label") or None,
        "enabled": bool(payload.get("enabled", True)),
    }
    if announcement_id:
        res = supabase.table("announcement_banner").update(body).eq("id", announcement_id).execute()
        return (res.data or [{}])[0]
    res = supabase.table("announcement_banner").insert(body).execute()
    return (res.data or [{}])[0]

def search_faqs(supabase, query: str, limit: int = 3) -> List[Dict]:
    if not query:
        return []
    pattern = f"%{query.strip()}%"
    res = (
        supabase.table("faqs")
        .select("*")
        .or_(f"question.ilike.{pattern},answer.ilike.{pattern}")
        .limit(limit)
        .execute()
    )
    return res.data or []


def create_faq(supabase, question: str, answer: str, sort_order: int = 0) -> Dict:
    payload = {"question": question, "answer": answer}
    if sort_order and sort_order > 0:
        payload["sort_order"] = sort_order
    else:
        max_res = (
            supabase.table("faqs")
            .select("sort_order")
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        max_order = 0
        if max_res.data:
            max_order = int(max_res.data[0].get("sort_order") or 0)
        payload["sort_order"] = max_order + 1
    res = supabase.table("faqs").insert(payload).execute()
    _normalize_faqs_order(supabase)
    return (res.data or [{}])[0]


def update_faq(supabase, faq_id: str, updates: Dict) -> Dict:
    res = supabase.table("faqs").update(updates).eq("id", faq_id).execute()
    _normalize_faqs_order(supabase)
    return (res.data or [{}])[0]


def delete_faq(supabase, faq_id: str) -> Dict:
    res = supabase.table("faqs").delete().eq("id", faq_id).execute()
    _normalize_faqs_order(supabase)
    return {"deleted": True, "id": faq_id} if res else {"deleted": False}


def create_policy(supabase, title: str, content: str, sort_order: int = 0, slug: str = None) -> Dict:
    payload = {"title": title, "content": content, "sort_order": sort_order}
    if slug:
        max_res = (
            supabase.table("policies")
            .select("sort_order")
            .eq("slug", slug)
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        max_order = 0
        if max_res.data:
            max_order = int(max_res.data[0].get("sort_order") or 0)
        payload["sort_order"] = max_order + 1
    if slug:
        payload["slug"] = slug
    res = (
        supabase.table("policies")
        .insert(payload)
        .execute()
    )
    _normalize_policies_order(supabase, slug)
    return (res.data or [{}])[0]


def update_policy(supabase, policy_id: str, updates: Dict) -> Dict:
    slug_res = supabase.table("policies").select("slug").eq("id", policy_id).maybe_single().execute()
    slug = (slug_res.data or {}).get("slug")
    res = supabase.table("policies").update(updates).eq("id", policy_id).execute()
    target_slug = updates.get("slug") or slug
    _normalize_policies_order(supabase, target_slug)
    return (res.data or [{}])[0]


def delete_policy(supabase, policy_id: str) -> Dict:
    slug_res = supabase.table("policies").select("slug").eq("id", policy_id).maybe_single().execute()
    slug = (slug_res.data or {}).get("slug")
    res = supabase.table("policies").delete().eq("id", policy_id).execute()
    _normalize_policies_order(supabase, slug)
    return {"deleted": True, "id": policy_id} if res else {"deleted": False}
