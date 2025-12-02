import os
import re
import logging
from typing import Any, Dict, List, Text

import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

# Import live-agent handoff action so the action server registers it
from liveagent_action import ActionHandoffToLiveAgent

# Set up logger
logger = logging.getLogger(__name__)

# NOTE: REPLACE WITH YOUR CONFIRMED, WORKING KEY
SUPABASE_URL = "https://uexvsnwbgnuxkgkaenjp.supabase.co/rest/v1/product_stock_view"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleHZzbndiZ251eGtna2FlbmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDIzNDMzOSwiZXhwIjoyMDc5ODEwMzM5fQ.wejc693CUXVf-aymTQMZUkzpeIcH-oOKR-bdtesZQbI"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

CATEGORY_SPECS = {
    "keyboard": ["size", "connection", "switch_type"],
    "mouse": ["connection", "polling_hz", "weight_grams"],
    "ssd": ["interface", "read_mb_s", "write_mb_s", "capacity_gb"],
    "monitor": ["panel_type", "refresh_hz", "resolution", "screen_size_inches"]
}

class ActionFetchProductsWithFilters(Action):
    def name(self) -> Text:
        return "action_fetch_products_with_filters"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        product_category = tracker.get_slot("product_category")
        product_price = tracker.get_slot("product_price")
        product_specs_text = tracker.get_slot("product_specs")
        product_brand = tracker.get_slot("product_brand")
    
        category_key = product_category.lower() if product_category else None
        brand_key = product_brand.lower() if product_brand else None

        # --- 1. Parse Price Range ---
        lower, upper = 0, float('inf')
        if product_price:
            numbers = sorted([float(n) for n in re.findall(r"\d+", product_price)])
            if numbers:
                upper = numbers[0] if len(numbers) == 1 else numbers[1]
                lower = 0 if len(numbers) == 1 else numbers[0]
        
        # --- 2. Parse Product Specs ---
        product_specs_key_value = {}
        if product_specs_text and ":" in product_specs_text:
            try:
                product_specs_key_value = dict(item.split(":") for item in product_specs_text.split(",") if ":" in item)
            except Exception:
                product_specs_key_value = {}

        try:
            # --- 3. Fetch Data ---
            response = requests.get(SUPABASE_URL, headers=headers)
            if response.status_code != 200:
                dispatcher.utter_message(text=f"Failed to fetch products: {response.status_code}")
                # Clear all slots
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None), SlotSet("product_brand", None)]

            data = response.json()
            data = data.get("data") if isinstance(data, dict) and "data" in data else data

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="No products found in the database.")
                # Clear all slots
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None), SlotSet("product_brand", None)]

            # --- 4. Filter Products ---
            filtered_products = []
            for item in data:
                
                # Category Filter (Robust Substring Match)
                # Ensure value is treated as string, even if DB returns None/Null.
                category = str(item.get("category") or "").lower()
                if category_key and category_key not in category:
                    continue

                # Brand Filter (Robust Substring Match)
                # Ensure value is treated as string, even if DB returns None/Null.
                brand = str(item.get("Brand") or "").lower()
                if brand_key and brand_key not in brand:
                    continue
                
                # Price Filter
                try:
                    price = float(item.get("price") or 0)
                except (ValueError, TypeError):
                    continue
                    
                if product_price and not (lower <= price <= upper):
                    continue
                
                # Specs Filter: TEMPORARILY DISABLED (as planned)
                pass 
                
                filtered_products.append(item)

            # --- 5. Prepare Response and Clear Slots ---
            if not filtered_products:
                msg_parts = []
                if product_category:
                    msg_parts.append(f"category '{product_category}'")
                
                if product_brand:
                    msg_parts.append(f"Brand '{product_brand}'")
                
                price_filter_msg = ""
                if product_price: 
                    if upper != float('inf') and lower == 0:
                        price_filter_msg = f"under ${upper}"
                    elif lower > 0 and upper != float('inf'):
                        price_filter_msg = f"between ${lower} and ${upper}"
                    elif lower > 0 and upper == float('inf'):
                        price_filter_msg = f"over ${lower}"
                
                if price_filter_msg:
                    msg_parts.append(price_filter_msg)
                
                if product_specs_text:
                    msg_parts.append(f"with specifications '{product_specs_text}'")
                
                dispatcher.utter_message(text=f"No products found matching {' and '.join(msg_parts) if msg_parts else 'your criteria'}.")
                
                # Clear all slots
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None), SlotSet("product_brand", None)]

            # --- SUCCESS PATH ---
            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
            
            product_links = []
            
            for item in filtered_products:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                price = item.get("price", 'N/A')
                
                # STOCK: Extract stock and create dynamic message
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

        except Exception as e:
            logger.error(f"Error in action_fetch_products_with_filters: {e}", exc_info=True)
            dispatcher.utter_message(text=f"Error processing your request. Please try again.")
            
        # Clear all slots
        return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None), SlotSet("product_brand", None)]

# ----------------------------------------------------------------------
# ActionFetchAllProducts (Corrected for stock display)
# ----------------------------------------------------------------------

class ActionFetchAllProducts(Action):
    def name(self) -> Text:
        return "action_fetch_all_products"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(text="Fetching all available products...")
        
        try:
            response = requests.get(SUPABASE_URL, headers=headers)
            if response.status_code != 200:
                dispatcher.utter_message(text=f"Failed to fetch products: {response.status_code}")
                return []

            data = response.json()
            data = data.get("data") if isinstance(data, dict) and "data" in data else data

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="The database currently contains no products.")
                return []
            
            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
            product_links = []
            
            for item in data:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                price = item.get("price", 'N/A')
                
                # STOCK: Extract stock and create dynamic message
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

        except Exception as e:
            logger.error(f"Error in action_fetch_all_products: {e}", exc_info=True)
            dispatcher.utter_message(text=f"An unexpected error occurred while fetching all products. Please check the logs.")
            
        return []
    
# ----------------------------------------------------------------------
# ActionSendFAQLink
# ----------------------------------------------------------------------
class ActionSendFAQLink(Action):
    def name(self) -> Text:
        return "action_faq_link"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        faq_url = "http://localhost:3000/faq"
        dispatcher.utter_template("utter_faq_link", tracker, link=faq_url)
        return []
    
# ----------------------------------------------------------------------
# ActionReturnPolicyLink
# ----------------------------------------------------------------------
class ActionReturnPolicyLink(Action):
    def name(self) -> Text:
        return "action_return_policy_link"
    
    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return_policy_url = "http://localhost:3000/shipping-returns"
        dispatcher.utter_template("utter_return_policy_link", tracker, link=return_policy_url)
        return []


# Explicitly reference the imported handoff action to avoid lint/unused removal
class HandoffToAgent(ActionHandoffToLiveAgent):
    """Alias to keep the action server registering the handoff action."""
    pass
