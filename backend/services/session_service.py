import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple


def _hash_token(token: str) -> str:
  """Return a stable hash of the token so we never store raw tokens in the DB."""
  return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _session_ttl_hours() -> int:
  try:
    return int(os.getenv("SESSION_TTL_HOURS", "168"))  # default 7 days
  except ValueError:
    return 168


def _now() -> datetime:
  return datetime.now(timezone.utc)


def create_session(supabase, user_id: str, user_agent: Optional[str] = None) -> Dict[str, str]:
  """Create a server-side session row and return the raw token + expiry."""
  token = secrets.token_urlsafe(32)
  token_hash = _hash_token(token)
  expires_at = _now() + timedelta(hours=_session_ttl_hours())

  supabase.table("app_session").insert(
    {
      "user_id": user_id,
      "token_hash": token_hash,
      "user_agent": user_agent or "",
      "expires_at": expires_at.isoformat(),
    }
  ).execute()

  return {"token": token, "expires_at": expires_at.isoformat()}


def revoke_session(supabase, token: str) -> bool:
  """Delete a session by raw token. Returns True if a row was removed."""
  if not token:
    return False
  token_hash = _hash_token(token)
  res = supabase.table("app_session").delete().eq("token_hash", token_hash).execute()
  return bool(res.data)


def get_session(supabase, token: str) -> Tuple[Optional[Dict], Optional[str]]:
  """Lookup a session by token; returns (session_row, error_message)."""
  if not token:
    return None, "Missing session token"

  token_hash = _hash_token(token)
  res = (
    supabase.table("app_session")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", token_hash)
    .limit(1)
    .execute()
  )
  row = res.data[0] if res.data else None
  if not row:
    return None, "Session not found"

  if row.get("revoked_at"):
    return None, "Session revoked"

  expires_at = row.get("expires_at")
  try:
    if expires_at and datetime.fromisoformat(str(expires_at)) < _now():
      return None, "Session expired"
  except Exception:
    return None, "Invalid session expiry"

  return row, None
