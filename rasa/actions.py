import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Text, Optional

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

CSAT_ENDPOINT = os.getenv(
    "CSAT_WEBHOOK_URL",
    f"{BACKEND_BASE_URL}/support/sessions/from_rasa/csat",
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

        if not SUPABASE_PRODUCTS_URL or not SUPABASE_KEY:
            dispatcher.utter_message(
                text="Product search is unavailable right now (missing Supabase configuration)."
            )
            return [
                SlotSet("product_category", None),
                SlotSet("product_price", None),
                SlotSet("product_specs", None),
                SlotSet("product_brand", None),
            ]

        category_key = product_category.lower() if product_category else None
        brand_key = product_brand.lower() if product_brand else None

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
            response = requests.get(SUPABASE_PRODUCTS_URL, headers=HEADERS)
            if response.status_code != 200:
                dispatcher.utter_message(
                    text=f"Failed to fetch products: {response.status_code}"
                )
                return [
                    SlotSet("product_category", None),
                    SlotSet("product_price", None),
                    SlotSet("product_specs", None),
                    SlotSet("product_brand", None),
                ]

            data = response.json()
            data = data.get("data") if isinstance(data, dict) and "data" in data else data

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

                brand = str(item.get("Brand") or "").lower()
                if brand_key and brand_key not in brand:
                    continue

                try:
                    price = float(item.get("price") or 0)
                except (ValueError, TypeError):
                    continue

                if product_price and not (lower <= price <= upper):
                    continue

                filtered_products.append(item)

            if not filtered_products:
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
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                price = item.get("price", "N/A")
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

        if not SUPABASE_PRODUCTS_URL or not SUPABASE_KEY:
            dispatcher.utter_message(
                text="Product search is unavailable right now (missing Supabase configuration)."
            )
            return []

        try:
            response = requests.get(SUPABASE_PRODUCTS_URL, headers=HEADERS)
            if response.status_code != 200:
                dispatcher.utter_message(
                    text=f"Failed to fetch products: {response.status_code}"
                )
                return []

            data = response.json()
            data = data.get("data") if isinstance(data, dict) and "data" in data else data

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="The database currently contains no products.")
                return []

            frontend_base = FRONTEND_BASE_URL
            product_links = []

            for item in data:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                price = item.get("price", "N/A")
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
        base = os.getenv("FRONTEND_BASE_URL", "").rstrip("/")
        faq_url = f"{base}/faq" if base else "/faq"
        dispatcher.utter_template("utter_faq_link", tracker, link=faq_url)
        return []


class ActionReturnPolicyLink(Action):
    """Send return policy link to the user."""

    def name(self) -> Text:
        return "action_return_policy_link"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        base = os.getenv("FRONTEND_BASE_URL", "").rstrip("/")
        return_policy_url = f"{base}/shipping-returns" if base else "/shipping-returns"
        dispatcher.utter_template("utter_return_policy_link", tracker, link=return_policy_url)
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
        base = os.getenv("FRONTEND_BASE_URL", "").rstrip("/")
        shipping_url = f"{base}/shipping-returns" if base else "/shipping-returns"
        dispatcher.utter_template("utter_shipping_info", tracker, link=shipping_url)
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
        return {"product_category": cleaned}

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
