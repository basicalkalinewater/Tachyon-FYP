import os
from typing import Any, Dict, List, Text

import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher


class ActionHandoffToLiveAgent(Action):
    """Create a live-agent session via backend and notify the user."""

    def name(self) -> Text:
        return "action_handoff_to_agent"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        sender_id = tracker.sender_id
        last_user_message = tracker.latest_message.get("text", "")
        backend_url = os.getenv(
            "LIVE_AGENT_HANDOFF_URL",
            "http://localhost:4000/support/sessions/from_rasa",
        )

        payload = {
            "sender_id": sender_id,
            "last_message": last_user_message,
        }

        try:
            resp = requests.post(backend_url, json=payload, timeout=3)
            dispatcher.utter_message(text="Connecting you to a live agent now.")
            print(
                f"[action_handoff_to_agent] POST {backend_url} "
                f"status={resp.status_code} body={resp.text}"
            )
        except Exception as exc:
            print(f"[action_handoff_to_agent] backend call failed: {exc}")
            dispatcher.utter_message(
                text="I couldn't start a live agent session right now. Please try again shortly."
            )

        return []
