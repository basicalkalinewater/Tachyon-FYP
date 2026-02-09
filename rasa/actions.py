import logging
import os
import re
import json
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

def _is_product_related(text: Text) -> bool:
    if not text:
        return False
    # Added Chinese keywords to the set
    keywords = {
        "product", "products", "keyboard", "mouse", "monitor", "ssd", "laptop", "price",
        "产品", "键盘", "鼠标", "显示器", "价格", "多少钱", "笔记本", "想要"
    }
    lowered = text.lower()
    return any(word in lowered for word in keywords)


CHINESE_MAPPING = {
    "categories": {
        "键盘": "keyboard", "鼠标": "mouse", "显示器": "monitor",
        "硬盘": "ssd", "固态": "ssd", "屏幕": "monitor"
    },
    "specs": {
        # Panel & Switch Types
        "ips": "IPS", "oled": "WOLED", "woled": "WOLED",
        "段落轴": "Tactile", "线性轴": "Linear", "茶轴": "Tactile", "红轴": "Linear",
        # Connection
        "无线": "Wireless", "有线": "Wired", "蓝牙": "Bluetooth",
        # Sizes/Interfaces
        "全尺寸": "100%", "接口": "PCIe"
    }
}

class ActionFetchProductsWithFilters(Action):
    def name(self) -> Text:
        return "action_fetch_products_with_filters"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[EventType]:
        user_msg = tracker.latest_message.get("text", "").lower()
        slot_cat = tracker.get_slot("product_category")
        slot_spec = tracker.get_slot("product_specs")
        slot_brand = tracker.get_slot("product_brand")
        slot_price = tracker.get_slot("product_price") # New Slot
        is_zh = any("\u4e00" <= char <= "\u9fff" for char in user_msg)

        # 1. Category Resolution
        category_target = None
        if slot_cat:
            category_target = CHINESE_MAPPING["categories"].get(slot_cat, slot_cat).lower()
        else:
            for cn, en in CHINESE_MAPPING["categories"].items():
                if cn in user_msg: category_target = en; break

        # 2. Spec Cleanup
        spec_keyword = None
        if slot_spec:
            clean_val = re.sub(r'(?i)hz|赫兹|刷新率|面板|%|tb|gb|个|布局|ms|毫秒|g|克|寸|英寸|mb/s| ', '', str(slot_spec).lower()).strip()
            spec_keyword = CHINESE_MAPPING["specs"].get(clean_val, clean_val)

        # 3. Price Cleanup (Extracting the max budget)
        max_budget = None
        if slot_price:
            try:
                # Remove currency symbols and get raw number
                clean_price = re.sub(r'[^\d.]', '', str(slot_price))
                max_budget = float(clean_price)
            except:
                max_budget = None

        try:
            from actions import _fetch_products, _extract_price, _format_price
            data = _fetch_products()
            
            if not data:
                dispatcher.utter_message(text="Database empty.")
                return []

            filtered = []
            for item in data:
                # --- Brand Filter ---
                if slot_brand:
                    if str(slot_brand).lower() not in str(item.get("brand", "")).lower() and \
                       str(slot_brand).lower() not in str(item.get("title", "")).lower():
                        continue

                # --- Category Filter ---
                db_cat = str(item.get("category", "")).lower()
                if category_target and category_target not in db_cat:
                    if not (category_target == "monitor" and "display" in db_cat):
                        continue

                # --- Price Filter (NEW) ---
                if max_budget is not None:
                    item_price = _extract_price(item)
                    if item_price is None or item_price > max_budget:
                        continue

                # --- Strict Spec Matcher ---
                if spec_keyword:
                    db_specs = item.get("specs") or {}
                    if isinstance(db_specs, str):
                        try: db_specs = json.loads(db_specs)
                        except: db_specs = {}

                    db_values_cleaned = [re.sub(r'(?i)hz|tb|gb|ms| ', '', str(v)).strip() for v in db_specs.values()]
                    db_title = str(item.get('title', '')).lower()
                    
                    is_in_specs = spec_keyword in db_values_cleaned
                    is_in_title = re.search(rf"\b{spec_keyword}\b", db_title, re.IGNORECASE)
                    if not (is_in_specs or is_in_title):
                        continue 

                filtered.append(item)

            # 4. Final Response with Formatted Links
            if not filtered:
                dispatcher.utter_message(text="抱歉，没找到符合条件的产品。" if is_zh else "No matching products found.")
            else:
                intro = "为您找到以下产品：\n" if is_zh else "I found these for you:\n"
                links = []
                for i in filtered[:5]:
                    p_id = i.get('id')
                    title = i.get('title') or "Product"
                    price = _format_price(_extract_price(i))
                    url = f"{FRONTEND_BASE_URL}/product/{p_id}"
                    links.append(f"- [{title}]({url}) - **${price}**")
                
                dispatcher.utter_message(text=intro + "\n".join(links))

        except Exception as e:
            logger.error(f"Search Action Error: {e}")
            dispatcher.utter_message(text="An error occurred.")

        return [SlotSet(s, None) for s in ["product_category", "product_brand", "product_price", "product_specs"]]
    
class ActionFetchAllProducts(Action):
    """Fetch and list all products."""

    def name(self) -> Text:
        return "action_fetch_all_products"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        dispatcher.utter_message(text="Here are all the available products:")

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


def _send_policy_summary(dispatcher: CollectingDispatcher, slug: str, title: str, link_path: str) -> None:
    url = f"{BACKEND_API_BASE_URL}/content/policies"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json().get("data", [])
        items = [p for p in data if (p.get("slug") or "").lower() == slug]
        if not items:
            dispatcher.utter_message(text=f"{title} details are unavailable right now.")
            return
        item = items[0]
        content = _strip_html(item.get("content") or "")
        summary_lines = [line.strip() for line in content.split("\n") if line.strip()]
        summary_lines = [re.sub(r"^[-*]\s*", "", line) for line in summary_lines]
        summary_lines = summary_lines[:4]
        summary = "\n".join(f"- {line}" for line in summary_lines) if summary_lines else ""
        link = f"{FRONTEND_BASE_URL}{link_path}"
        if summary:
            dispatcher.utter_message(text=f"{title}:\n{summary}\n- Full policy: [View full policy]({link})")
        else:
            dispatcher.utter_message(text=f"{title} details are unavailable right now.\n- Full policy: [View full policy]({link})")
    except Exception as exc:
        logger.error("Failed to fetch policies: %s", exc)
        dispatcher.utter_message(
            text=f"I couldn't load the {title.lower()} right now. Please try again later."
        )


def _send_shipping_returns_policy(dispatcher: CollectingDispatcher) -> None:
    _send_policy_summary(
        dispatcher,
        slug="shipping-returns",
        title="Shipping & Returns",
        link_path="/shipping-returns",
    )


def _strip_html(value: str) -> str:
    if not value:
        return ""
    text = value
    text = re.sub(r"(?i)</h[1-6]>", "\n", text)
    text = re.sub(r"(?i)<h[1-6][^>]*>", "", text)
    text = re.sub(r"(?i)<br\\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n", text)
    text = re.sub(r"(?i)<p[^>]*>", "", text)
    text = re.sub(r"(?i)<li[^>]*>", "- ", text)
    text = re.sub(r"(?i)</li>", "\n", text)
    text = re.sub(r"(?i)</ul>|</ol>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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
    """Use LLM for product comparisons with bilingual support."""

    def name(self) -> Text:
        return "action_llm_compare"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        message = tracker.latest_message.get("text", "")
        
        # Detect if the input contains Chinese characters
        is_zh = any("\u4e00" <= char <= "\u9fff" for char in message)
        
        # Construct a bilingual-aware prompt
        if is_zh:
            prompt = f"你是一位专业的电脑硬件专家。请用中文回答这个对比问题：{message}"
        else:
            prompt = f"You are a professional PC hardware expert. Please answer this comparison question in English: {message}"
        
        logger.info(f"Calling LLM Compare with prompt: {prompt}")
        _call_llm(dispatcher, LLM_COMPARE_ENDPOINT, prompt)
        return []

class ActionLLMFallback(Action):
    """Use LLM on NLU fallback for general product guidance with bilingual support."""

    def name(self) -> Text:
        return "action_llm_fallback"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[EventType]:
        message = tracker.latest_message.get("text", "")
        
        # Detect language
        is_zh = any("\u4e00" <= char <= "\u9fff" for char in message)

        if not _is_product_related(message):
            if is_zh:
                dispatcher.utter_message(
                    text="我可以帮您了解产品详情、物流退换货政策或常见问题。请问您需要哪方面的帮助？"
                )
            else:
                dispatcher.utter_message(
                    text="I can help with products, shipping & returns, or FAQs. Which one do you need?"
                )
            return []

        # Construct a bilingual-aware prompt for general questions
        if is_zh:
            prompt = f"请用中文回答这个关于电脑硬件或购物的问题：{message}"
        else:
            prompt = f"Please answer this PC hardware or shopping related question in English: {message}"

        logger.info(f"Calling LLM Fallback with prompt: {prompt}")
        _call_llm(dispatcher, LLM_FALLBACK_ENDPOINT, prompt)
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



