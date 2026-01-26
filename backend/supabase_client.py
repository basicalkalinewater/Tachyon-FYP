import os
from supabase import Client, create_client
from dotenv import load_dotenv
from postgrest._sync.client import SyncPostgrestClient
from postgrest.utils import SyncClient as PostgrestSyncClient


def _disable_postgrest_http2():
    def _create_session_no_http2(self, base_url, headers, timeout, verify=True):
        return PostgrestSyncClient(
            base_url=base_url,
            headers=headers,
            timeout=timeout,
            verify=verify,
            follow_redirects=True,
            http2=False,
        )

    SyncPostgrestClient.create_session = _create_session_no_http2


_disable_postgrest_http2()


def get_supabase() -> Client:
    """
    Initialize and return a Supabase client using server-side credentials.

    - Loads .env from the project root (one level up from backend/).
    - Expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.
    - Raises a RuntimeError if either is missing so callers fail fast.
    """
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    return create_client(url, key)
