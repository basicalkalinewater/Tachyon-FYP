import os
from typing import Any, Dict, List, Text

import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

SUPABASE_URL = "https://uexvsnwbgnuxkgkaenjp.supabase.co/rest/v1/products"
# SUPABASE_KEY should be kept secret in production environments, will work on that in later phase
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleHZzbndiZ251eGtna2FlbmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDIzNDMzOSwiZXhwIjoyMDc5ODEwMzM5fQ.wejc693CUXVf-aymTQMZUkzpeIcH-oOKR-bdtesZQbI"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Rasa fetches all products from Supabase
class ActionFetchProducts(Action):
    def name(self):
        return "action_fetch_products"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: dict):
        try:
            response = requests.get(SUPABASE_URL, headers=headers)
            print("Raw response text:", response.text)
            data = response.json()

            if isinstance(data, dict) and "data" in data:
                data = data["data"]

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="No products found.")
                return []

            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
            product_links = []
            for item in data:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url})")
                else:
                    product_links.append(f"- {title}")

            dispatcher.utter_message(
                text="Here are the products:\n" + "\n".join(product_links)
            )

        except Exception as e:
            dispatcher.utter_message(text=f"Error fetching products: {e}")

        return []
    
# Rasa fetches specific product based on user query
class ActionFetchSpecificProduct(Action):
    def name(self) -> Text:
        return "action_fetch_specific_product"

    def run(
        self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]
    ) -> List[Dict[Text, Any]]:

        # Get the product name from the slot
        product_query = tracker.get_slot("title") or tracker.get_slot("product_title")
        if not product_query:
            dispatcher.utter_message(text="Please tell me which product you want to see.")
            return []

        try:
            response = requests.get(SUPABASE_URL, headers=headers)
            if response.status_code != 200:
                dispatcher.utter_message(text=f"Failed to fetch products: {response.status_code}")
                return []

            data = response.json()
            # Supabase response usually has {"data": [...]}
            if isinstance(data, dict) and "data" in data:
                data = data["data"]

            if not isinstance(data, list) or len(data) == 0:
                dispatcher.utter_message(text="No products found in the database.")
                return []

            # Filter products by title (case-insensitive match)
            filtered_products = [
                item for item in data
                if product_query.lower() in item.get("title", "").lower()
            ]

            if not filtered_products:
                dispatcher.utter_message(
                    text=f"No product found matching '{product_query}'."
                )
                return []

            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
            product_links = []
            for item in filtered_products:
                title = item.get("title", "Unnamed product")
                product_id = item.get("id")
                if product_id:
                    url = f"{frontend_base}/product/{product_id}"
                    product_links.append(f"- [{title}]({url})")
                else:
                    product_links.append(f"- {title}")

            dispatcher.utter_message(
                text="Here is what I found:\n" + "\n".join(product_links)
            )

        except Exception as e:
            dispatcher.utter_message(text=f"Error fetching product: {e}")

        return []
    
