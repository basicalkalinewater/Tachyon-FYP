from typing import Dict, List


def list_faqs(supabase) -> List[Dict]:
    res = supabase.table("faqs").select("*").order("sort_order").order("created_at", desc=True).execute()
    return res.data or []


def list_policies(supabase) -> List[Dict]:
    res = supabase.table("policies").select("*").order("sort_order").order("created_at", desc=True).execute()
    return res.data or []


def create_faq(supabase, question: str, answer: str, sort_order: int = 0) -> Dict:
    res = (
        supabase.table("faqs")
        .insert({"question": question, "answer": answer, "sort_order": sort_order})
        .execute()
    )
    return (res.data or [{}])[0]


def update_faq(supabase, faq_id: str, updates: Dict) -> Dict:
    res = supabase.table("faqs").update(updates).eq("id", faq_id).execute()
    return (res.data or [{}])[0]


def delete_faq(supabase, faq_id: str) -> Dict:
    res = supabase.table("faqs").delete().eq("id", faq_id).execute()
    return {"deleted": True, "id": faq_id} if res else {"deleted": False}


def create_policy(supabase, title: str, content: str, sort_order: int = 0) -> Dict:
    res = (
        supabase.table("policies")
        .insert({"title": title, "content": content, "sort_order": sort_order})
        .execute()
    )
    return (res.data or [{}])[0]


def update_policy(supabase, policy_id: str, updates: Dict) -> Dict:
    res = supabase.table("policies").update(updates).eq("id", policy_id).execute()
    return (res.data or [{}])[0]


def delete_policy(supabase, policy_id: str) -> Dict:
    res = supabase.table("policies").delete().eq("id", policy_id).execute()
    return {"deleted": True, "id": policy_id} if res else {"deleted": False}
