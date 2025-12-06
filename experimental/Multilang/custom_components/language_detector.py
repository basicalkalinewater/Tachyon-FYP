"""FastText-based language detector for Rasa (en/zh-ready).

Adds `lang` attribute to each Message so downstream components can route or choose responses.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional, Text

import fasttext
from rasa.nlu.components import Component
from rasa.nlu.model import Metadata
from rasa.shared.nlu.constants import TEXT
from rasa.shared.nlu.training_data.message import Message


class LanguageDetector(Component):
    """Lightweight language detector using fastText lid.176 model."""

    defaults = {
        "model_path": "models/lid.176.bin",  # fastText LID model (covers 176 langs)
        "fallback_lang": "en",
        "min_prob": 0.6,
    }
    provides = ["lang"]

    def __init__(self, component_config: Optional[Dict[Text, Any]] = None) -> None:
        super().__init__(component_config)
        self.model_path: Text = self.component_config["model_path"]
        self.fallback_lang: Text = self.component_config["fallback_lang"]
        self.min_prob: float = float(self.component_config["min_prob"])
        self.model: Optional[fasttext.FastText] = None

    def load_model(self) -> None:
        if self.model is not None:
            return
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Language id model not found at {self.model_path}; "
                "download lid.176.bin from fastText and update model_path if needed."
            )
        self.model = fasttext.load_model(self.model_path)

    def process(self, message: Message, **kwargs: Any) -> None:
        self.load_model()
        text = message.get(TEXT) or ""
        if not text.strip():
            message.set("lang", self.fallback_lang)
            return

        label, prob = self.model.predict(text.replace("\n", " "))
        lang = label[0].replace("__label__", "")
        message.set("lang", lang if prob[0] >= self.min_prob else self.fallback_lang)

    @classmethod
    def load(
        cls,
        meta: Metadata,
        model_dir: Optional[Text] = None,
        model_metadata: Optional[Metadata] = None,
        cached_component: Optional[Component] = None,
        **kwargs: Any,
    ) -> "LanguageDetector":
        return cls(meta)
