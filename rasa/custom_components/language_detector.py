import logging
from typing import Any, Text, Dict, List, Type

from rasa.engine.graph import GraphComponent, ExecutionContext
from rasa.engine.recipes.default_recipe import DefaultV1Recipe
from rasa.engine.storage.resource import Resource
from rasa.engine.storage.storage import ModelStorage
from rasa.shared.nlu.training_data.message import Message
from rasa.shared.nlu.training_data.training_data import TrainingData

logger = logging.getLogger(__name__)

@DefaultV1Recipe.register(
    DefaultV1Recipe.ComponentType.MESSAGE_FEATURIZER, is_trainable=False
)
class LanguageDetector(GraphComponent):
    @classmethod
    def create(
        cls,
        config: Dict[Text, Any],
        model_storage: ModelStorage,
        resource: Resource,
        execution_context: ExecutionContext,
    ) -> "LanguageDetector":
        return cls(config)

    def __init__(self, config: Dict[Text, Any]) -> None:
        self.config = config

    def train(self, training_data: TrainingData) -> Resource:
        pass

    def process_training_data(self, training_data: TrainingData) -> TrainingData:
        return training_data

    def process(self, messages: List[Message]) -> List[Message]:
        for message in messages:
            text = message.get("text")
            if text:
                # Detect Chinese characters using Unicode range
                if any('\u4e00' <= char <= '\u9fff' for char in text):
                    detected_lang = "zh"
                else:
                    detected_lang = "en"
                
                # Set the 'lang' entity/slot for Rasa to use in domain logic
                message.set("entities", [
                    {
                        "entity": "lang",
                        "value": detected_lang,
                        "extractor": "LanguageDetector"
                    }
                ], add_to_output=True)
                
                logger.info(f"Detected language: {detected_lang} for text: {text}")
        
        return messages