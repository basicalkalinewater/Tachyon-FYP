import os
import re
import logging
from typing import Any, Dict, List, Text

import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

# Set up logger
logger = logging.getLogger(__name__)

SUPABASE_URL = "https://uexvsnwbgnuxkgkaenjp.supabase.co/rest/v1/products"
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
        
        category_key = product_category.lower() if product_category else None

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
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None)]

            data = response.json()
            data = data.get("data") if isinstance(data, dict) and "data" in data else data

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="No products found in the database.")
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None)]

            # --- 4. Filter Products ---
            filtered_products = []
            for item in data:
                category = item.get("category", "").lower()
                
                # Category Filter
                if category_key and category_key not in category:
                    continue
                
                # Price Filter
                try:
                    price = float(item.get("price") or 0)
                except (ValueError, TypeError):
                    continue
                    
                if product_price and not (lower <= price <= upper):
                    continue

                # Specs Filter
                match = True
                
                # Handling the simple value spec (like "IPS" from user input)
                if product_specs_text and category_key:
                    spec_value = product_specs_text.lower()
                    valid_specs_keys = CATEGORY_SPECS.get(category_key, [])
                    found_spec = False
                    
                    for spec_key in valid_specs_keys:
                        # FIX APPLIED HERE: Access the nested 'specs' dictionary first
                        specs_data = item.get('specs', {})
                        prod_val = specs_data.get(spec_key)

                        if prod_val is None: continue
                        
                        # Check 1: Value is a list
                        if isinstance(prod_val, list):
                            if spec_value in [v.lower() for v in prod_val]:
                                found_spec = True
                                break
                                
                        # Check 2: Value is a string (e.g., "IPS")
                        elif isinstance(prod_val, str):
                            if spec_value in prod_val.lower():
                                found_spec = True
                                break
                                
                        # Check 3: Value is a number
                        elif isinstance(prod_val, (int, float)):
                            if str(prod_val) == spec_value:
                                found_spec = True
                                break
                    
                    if not found_spec:
                        # You can remove this temporary logger after confirming the fix
                        logger.warning(
                            f"FILTER FAIL: Product '{item.get('title', 'N/A')}' (Cat: {category}) "
                            f"did not match spec '{spec_value}' (Checking keys: {valid_specs_keys})."
                            f"Actual specs data: {specs_data}"
                        )
                        match = False
                
                if not match:
                    continue

                filtered_products.append(item)

            # --- 5. Prepare Response and Clear Slots ---
            if not filtered_products:
                msg_parts = []
                if product_category:
                    msg_parts.append(f"category '{product_category}'")
                
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
                
                return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None)]

            # --- SUCCESS PATH ---
            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
            
            product_links = []  
            
            for item in filtered_products:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                price = item.get("price", 'N/A')

                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url}) - ${price}")
                else:
                    product_links.append(f"- {title} - ${price}")

            dispatcher.utter_message(
                text="Here is what I found:\n" + "\n".join(product_links)
            )

        except Exception as e:
            logger.error(f"Error in action_fetch_products_with_filters: {e}", exc_info=True)
            dispatcher.utter_message(text=f"Error processing your request. Please try again.")
            
        return [SlotSet("product_category", None), SlotSet("product_price", None), SlotSet("product_specs", None)]


# ----------------------------------------------------------------------
# ActionFetchAllProducts
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
                
                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url}) - ${price}")
                else:
                    product_links.append(f"- {title} - ${price}")

            dispatcher.utter_message(
                text="Here are all the products we have:\n" + "\n".join(product_links)
            )

        except Exception as e:
            logger.error(f"Error in action_fetch_all_products: {e}", exc_info=True)
            dispatcher.utter_message(text=f"An unexpected error occurred while fetching all products. Please check the logs.")
            
        return []