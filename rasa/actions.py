import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Text, Optional

import html
import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.events import EventType, SlotSet
from rasa_sdk.forms import FormValidationAction
from rasa_sdk.executor import CollectingDispatcher

# Support running from repo root (`rasa run actions --actions rasa.actions`) and from the rasa/ folder.
try:
    from .liveagent_action import ActionHandoffToLiveAgent  # package import
except ImportError:
    from liveagent_action import ActionHandoffToLiveAgent  # fallback when executed in rasa/

logger = logging.getLogger(__name__)

# Load environment variables from the repo root so the action server can reach Supabase
try:
    from dotenv import load_dotenv

    DOTENV_PATH = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(DOTENV_PATH)
    load_dotenv()
except Exception as exc:
    logger.warning("Could not load .env file: %s", exc)

# Service base URLs (use env to avoid localhost in prod)
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:4000").rstrip("/")
BACKEND_API_BASE_URL = os.getenv("BACKEND_API_BASE_URL", f"{BACKEND_BASE_URL}/api").rstrip("/")
PRODUCTS_API_URL = os.getenv("PRODUCTS_API_URL", f"{BACKEND_API_BASE_URL}/products").rstrip("/")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")

SUPABASE_BASE_URL = os.getenv("SUPABASE_URL") or ""
SUPABASE_REST_URL = os.getenv("SUPABASE_REST_URL") or ""
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
SUPABASE_PRODUCTS_URL = (
    SUPABASE_REST_URL.rstrip("/")
    if SUPABASE_REST_URL
    else f"{SUPABASE_BASE_URL.rstrip('/')}/rest/v1/product_stock_view"
    if SUPABASE_BASE_URL
    else ""
)

if not SUPABASE_PRODUCTS_URL or not SUPABASE_KEY:
    logger.error(
        "Supabase REST URL and service role key must be set in the action server environment/.env"
    )

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def _extract_price(item: Dict[Text, Any]) -> Optional[float]:
    for key in ("price", "unit_price", "unitPrice", "originalPrice", "original_price", "discount_price"):
        if key in item and item.get(key) is not None:
            raw = item.get(key)
            if isinstance(raw, str):
                cleaned = re.sub(r"[^\d.]+", "", raw)
                try:
                    return float(cleaned)
                except (TypeError, ValueError):
                    return None
            try:
                return float(raw)
            except (TypeError, ValueError):
                return None
    return None


def _format_price(value: Optional[float]) -> Text:
    if value is None:
        return "N/A"
    return f"{value:.2f}"

def _is_product_related(text: Text) -> bool:
    if not text:
        return False
    keywords = {
        "product",
        "products",
        "keyboard",
        "keyboards",
        "mouse",
        "mice",
        "monitor",
        "monitors",
        "ssd",
        "ssds",
        "headphone",
        "headphones",
        "laptop",
        "laptops",
        "speaker",
        "speakers",
        "price",
        "budget",
        "under",
        "below",
        "brand",
        "wireless",
        "wired",
        "bluetooth",
        "rgb",
    }
    lowered = text.lower()
    return any(word in lowered for word in keywords)


def _normalize_brand(value: Optional[Text]) -> Optional[Text]:
    if not value:
        return None
    cleaned = re.sub(r"[^a-z0-9&\-\s]+", "", str(value).lower()).strip()
    if not cleaned:
        return None
    stopwords = {
        "product",
        "products",
        "item",
        "items",
        "keyboard",
        "keyboards",
        "mouse",
        "mice",
        "monitor",
        "monitors",
        "ssd",
        "ssds",
        "headphone",
        "headphones",
        "laptop",
        "laptops",
        "speaker",
        "speakers",
    }
    if cleaned in stopwords:
        return None
    tokens = cleaned.split()
    if len(tokens) > 3:
        tokens = tokens[:3]
    return " ".join(tokens)


def _fetch_products() -> Optional[List[Dict[Text, Any]]]:
    if PRODUCTS_API_URL:
        try:
            resp = requests.get(PRODUCTS_API_URL, timeout=8)
            if resp.status_code == 200:
                return resp.json()
        except Exception as exc:
            logger.error("Failed to fetch products from API: %s", exc)
    if not SUPABASE_PRODUCTS_URL or not SUPABASE_KEY:
        return None
    try:
        resp = requests.get(SUPABASE_PRODUCTS_URL, headers=HEADERS, timeout=8)
        if resp.status_code != 200:
            return None
        data = resp.json()
        data = data.get("data") if isinstance(data, dict) and "data" in data else data
        return data if isinstance(data, list) else None
    except Exception as exc:
        logger.error("Failed to fetch products from Supabase: %s", exc)
        return None

CSAT_ENDPOINT = os.getenv(
    "CSAT_WEBHOOK_URL",
    f"{BACKEND_BASE_URL}/support/sessions/from_rasa/csat",
)

LLM_COMPARE_ENDPOINT = os.getenv(
    "LLM_COMPARE_ENDPOINT",
    f"{BACKEND_BASE_URL}/api/llm/compare",
)
LLM_FALLBACK_ENDPOINT = os.getenv(
    "LLM_FALLBACK_ENDPOINT",
    f"{BACKEND_BASE_URL}/api/llm/fallback",
)


class ActionFetchProductsWithFilters(Action):
    """Fetch products from Supabase and filter by category, brand, and price."""

    def name(self) -> Text:
        return "action_fetch_products_with_filters"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        product_category = tracker.get_slot("product_category")
        product_price = tracker.get_slot("product_price")
        product_specs_text = tracker.get_slot("product_specs")
        product_brand = tracker.get_slot("product_brand")

        category_key = product_category.lower() if product_category else None
        brand_key = _normalize_brand(product_brand)

        lower, upper = 0, float("inf")
        if product_price:
            numbers = sorted([float(n) for n in re.findall(r"\d+", product_price)])
            if numbers:
                upper = numbers[0] if len(numbers) == 1 else numbers[1]
                lower = 0 if len(numbers) == 1 else numbers[0]

        product_specs_key_value = {}
        if product_specs_text and ":" in product_specs_text:
            try:
                product_specs_key_value = dict(
                    item.split(":") for item in product_specs_text.split(",") if ":" in item
                )
            except Exception:
                product_specs_key_value = {}

        try:
            data = _fetch_products()
            if not data:
                dispatcher.utter_message(
                    text="Product search is unavailable right now."
                )
                return [
                    SlotSet("product_category", None),
                    SlotSet("product_price", None),
                    SlotSet("product_specs", None),
                    SlotSet("product_brand", None),
                ]

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="No products found in the database.")
                return [
                    SlotSet("product_category", None),
                    SlotSet("product_price", None),
                    SlotSet("product_specs", None),
                    SlotSet("product_brand", None),
                ]

            filtered_products = []
            for item in data:
                category = str(item.get("category") or "").lower()
                if category_key and category_key not in category:
                    continue

                brand = str(item.get("Brand") or item.get("brand") or "").lower()
                if brand_key and brand_key not in brand:
                    continue

                price = _extract_price(item)
                if price is None:
                    continue

                if product_price and not (lower <= price <= upper):
                    continue

                filtered_products.append(item)

            if not filtered_products:
                # Fallback: if brand filter is too strict, surface top items in the category
                if brand_key and category_key:
                    relaxed = []
                    for item in data:
                        category = str(item.get("category") or "").lower()
                        if category_key and category_key not in category:
                            continue
                        relaxed.append(item)
                    if relaxed:
                        frontend_base = FRONTEND_BASE_URL
                        product_links = []
                        for item in relaxed[:5]:
                            title = (item.get("title") or item.get("name") or item.get("product_name") or "").strip()
                            product_id = item.get("id")
                            if not title and not product_id:
                                continue
                            if not title:
                                title = "Unnamed product"
                            price = _format_price(_extract_price(item))
                            stock = item.get("quantity_available", 0)
                            stock_msg = f" (In Stock: {stock})" if stock and stock > 0 else " (Out of Stock)"
                            if product_id:
                                url = f"{frontend_base}/product/{product_id}"
                                product_links.append(f"- [{title}]({url}) - ${price}{stock_msg}")
                            else:
                                product_links.append(f"- {title} - ${price}{stock_msg}")
                        dispatcher.utter_message(
                            text=(
                                f"I couldn't find {product_category} from {product_brand}. "
                                f"Here are some popular {product_category} instead:\n"
                                + "\n".join(product_links)
                            )
                        )
                        return [
                            SlotSet("product_category", None),
                            SlotSet("product_price", None),
                            SlotSet("product_specs", None),
                            SlotSet("product_brand", None),
                        ]
                parts = []
                if product_category:
                    parts.append(f"category '{product_category}'")
                if product_brand:
                    parts.append(f"brand '{product_brand}'")
                if product_price:
                    if upper != float("inf") and lower == 0:
                        parts.append(f"under ${upper}")
                    elif lower > 0 and upper != float("inf"):
                        parts.append(f"between ${lower} and ${upper}")
                    elif lower > 0 and upper == float("inf"):
                        parts.append(f"over ${lower}")
                if product_specs_text:
                    parts.append(f"with specifications '{product_specs_text}'")

                dispatcher.utter_message(
                    text=f"No products found matching {' and '.join(parts) if parts else 'your criteria'}."
                )
                return [
                    SlotSet("product_category", None),
                    SlotSet("product_price", None),
                    SlotSet("product_specs", None),
                    SlotSet("product_brand", None),
                ]

            frontend_base = FRONTEND_BASE_URL
            product_links = []
            for item in filtered_products:
                title = (item.get("title") or item.get("name") or item.get("product_name") or "").strip()
                product_id = item.get("id")
                if not title and not product_id:
                    continue
                if not title:
                    title = "Unnamed product"
                price = _format_price(_extract_price(item))
                stock = item.get("quantity_available", 0)
                stock_msg = f" (In Stock: {stock})" if stock and stock > 0 else " (Out of Stock)"

                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url}) - ${price}{stock_msg}")
                else:
                    product_links.append(f"- {title} - ${price}{stock_msg}")

            dispatcher.utter_message(
                text="Here is what I found:\n" + "\n".join(product_links)
            )

        except Exception as exc:
            logger.error(f"Error in action_fetch_products_with_filters: {exc}", exc_info=True)
            dispatcher.utter_message(
                text="Error processing your request. Please try again."
            )

        return [
            SlotSet("product_category", None),
            SlotSet("product_price", None),
            SlotSet("product_specs", None),
            SlotSet("product_brand", None),
        ]


class ActionFetchAllProducts(Action):
    """Fetch and list all products."""

    def name(self) -> Text:
        return "action_fetch_all_products"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        dispatcher.utter_message(text="Fetching all available products...")

        try:
            data = _fetch_products()
            if not data:
                dispatcher.utter_message(
                    text="Product search is unavailable right now."
                )
                return []

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="The database currently contains no products.")
                return []

            frontend_base = FRONTEND_BASE_URL
            product_links = []

            for item in data:
                title = (item.get("title") or item.get("name") or item.get("product_name") or "").strip()
                product_id = item.get("id")
                if not title and not product_id:
                    continue
                if not title:
                    title = "Unnamed product"
                price = _format_price(_extract_price(item))
                stock = item.get("quantity_available", 0)
                stock_msg = f" (In Stock: {stock})" if stock and stock > 0 else " (Out of Stock)"

                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url}) - ${price}{stock_msg}")
                else:
                    product_links.append(f"- {title} - ${price}{stock_msg}")

            dispatcher.utter_message(
                text="Here are all the products we have:\n" + "\n".join(product_links)
            )

        except Exception as exc:
            logger.error(f"Error in action_fetch_all_products: {exc}", exc_info=True)
            dispatcher.utter_message(
                text="An unexpected error occurred while fetching all products. Please check the logs."
            )

        return []


class ActionSendFAQLink(Action):
    """Send FAQ link to the user."""

    def name(self) -> Text:
        return "action_faq_link"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        url = f"{BACKEND_API_BASE_URL}/content/faqs"
        try:
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            if not data:
                dispatcher.utter_message(text="No FAQs are available right now.")
                return []
            lines = []
            for item in data[:6]:
                question = item.get("question") or "FAQ"
                answer = item.get("answer") or ""
                lines.append(f"- {question}\n  {answer}")
            dispatcher.utter_message(text="Here are our FAQs:\n" + "\n".join(lines))
        except Exception as exc:
            logger.error("Failed to fetch FAQs: %s", exc)
            dispatcher.utter_message(
                text="I couldn't load the FAQs right now. Please try again later."
            )
        return []


class ActionReturnPolicyLink(Action):
    """Send return policy link to the user."""

    def name(self) -> Text:
        return "action_return_policy_link"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        _send_shipping_returns_policy(dispatcher)
        return []


class ActionShippingInfoLink(Action):
    """Send shipping info link (same as returns page)."""

    def name(self) -> Text:
        return "action_shipping_info_link"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[EventType]:
        _send_shipping_returns_policy(dispatcher)
        return []


def _send_shipping_returns_policy(dispatcher: CollectingDispatcher) -> None:
    url = f"{BACKEND_API_BASE_URL}/content/policies"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json().get("data", [])
        items = [p for p in data if (p.get("slug") or "").lower() == "shipping-returns"]
        if not items:
            dispatcher.utter_message(text="Shipping & returns details are unavailable right now.")
            return
        lines = []
        for item in items[:6]:
            title = item.get("title") or "Shipping & Returns"
            content = _strip_html(item.get("content") or "")
            lines.append(f"- {title}\n  {content}")
        dispatcher.utter_message(text="Shipping & Returns:\n" + "\n".join(lines))
    except Exception as exc:
        logger.error("Failed to fetch policies: %s", exc)
        dispatcher.utter_message(
            text="I couldn't load the shipping & returns policy right now. Please try again later."
        )


def _strip_html(value: str) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", "", value)
    return html.unescape(text).strip()


def _call_llm(dispatcher: CollectingDispatcher, endpoint: str, message: str) -> None:
    try:
        resp = requests.post(endpoint, json={"message": message}, timeout=18)
        if resp.status_code >= 400:
            dispatcher.utter_message(
                text="I couldn't reach the assistant right now. Please try again."
            )
            return
        data = resp.json().get("data") or {}
        text = data.get("text") or "I'm not sure about that yet. Please try another question."
        dispatcher.utter_message(text=text)
    except Exception as exc:
        logger.error("LLM call failed: %s", exc)
        dispatcher.utter_message(
            text="I couldn't reach the assistant right now. Please try again."
        )


class ActionLLMCompare(Action):
    """Use LLM for product comparisons."""

    def name(self) -> Text:
        return "action_llm_compare"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        message = tracker.latest_message.get("text", "")
        _call_llm(dispatcher, LLM_COMPARE_ENDPOINT, message)
        return []


class ActionLLMFallback(Action):
    """Use LLM on NLU fallback for general product guidance."""

    def name(self) -> Text:
        return "action_llm_fallback"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        message = tracker.latest_message.get("text", "")
        if not _is_product_related(message):
            dispatcher.utter_message(
                text="I can help with products, shipping & returns, or FAQs. Which one do you need?"
            )
            return []
        _call_llm(dispatcher, LLM_FALLBACK_ENDPOINT, message)
        return []


class HandoffToAgent(ActionHandoffToLiveAgent):
    """Trigger live-agent handoff and mark the slot."""

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[EventType]:
        events = super().run(dispatcher, tracker, domain) or []
        events.append(SlotSet("handoff_active", True))
        return events


class ActionForwardToAgent(Action):
    """Forward user messages to the live agent session."""

    def name(self) -> Text:
        return "action_forward_to_agent"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[EventType]:
        last_user_message = tracker.latest_message.get("text", "")
        sender_id = tracker.sender_id
        backend_url = os.getenv(
            "LIVE_AGENT_FORWARD_URL",
            f"{BACKEND_BASE_URL}/support/sessions/from_rasa/message",
        )

        payload = {
            "sender_id": sender_id,
            "last_message": last_user_message,
        }

        try:
            resp = requests.post(backend_url, json=payload, timeout=3)
            print(
                f"[action_forward_to_agent] POST {backend_url} "
                f"status={resp.status_code} body={resp.text}"
            )
            if resp.status_code == 409:
                dispatcher.utter_message(
                    text="An agent will join shortly. Your message will send once they claim the chat."
                )
            else:
                dispatcher.utter_message(text="Your message has been sent to a live agent.")
        except Exception as exc:
            print(f"[action_forward_to_agent] backend call failed: {exc}")
            dispatcher.utter_message(
                text="I couldn't reach a live agent right now. Please wait a moment."
            )
        return []


class ValidateProductFilterForm(FormValidationAction):
    """Basic validation/normalization for product_filter_form slots."""

    def name(self) -> Text:
        return "validate_product_filter_form"

    CATEGORY_ALIASES = {
        "keyboards": "keyboard",
        "keybaord": "keyboard",
        "mice": "mouse",
        "mous": "mouse",
        "monitors": "monitor",
        "moniter": "monitor",
        "ssds": "ssd",
        "speakers": "speaker",
        "laptops": "laptop",
    }
    ALLOWED_CATEGORIES = {
        "keyboard",
        "mouse",
        "monitor",
        "ssd",
        "headphones",
        "laptop",
        "speaker",
    }

    @staticmethod
    def _clean(value: Any) -> Optional[Text]:
        if value is None:
            return None
        if isinstance(value, str):
            val = value.strip()
            return val or None
        return str(value)

    def validate_product_category(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        cleaned = self._clean(slot_value)
        if not cleaned:
            dispatcher.utter_message(text="Tell me which category you want (e.g., monitor, ssd, keyboard).")
            return {"product_category": None}
        normalized = cleaned.lower()
        normalized = self.CATEGORY_ALIASES.get(normalized, normalized)
        if normalized not in self.ALLOWED_CATEGORIES:
            dispatcher.utter_message(
                text="I can help with keyboard, mouse, monitor, ssd, headphones, laptop, or speaker. Which category?"
            )
            return {"product_category": None}
        return {"product_category": normalized}

    def validate_product_price(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        return {"product_price": self._clean(slot_value)}

    def validate_product_specs(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        return {"product_specs": self._clean(slot_value)}

    def validate_product_brand(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        return {"product_brand": self._clean(slot_value)}


class ActionResetHandoff(Action):
    """Reset handoff state so messages stop forwarding to agent."""

    def name(self) -> Text:
        return "action_reset_handoff"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[EventType]:
        return [SlotSet("handoff_active", False)]
