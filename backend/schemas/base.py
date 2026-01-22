from typing import Type, TypeVar, Tuple, Union
from flask import jsonify, request
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


def validate_body(model: Type[T]) -> Union[Tuple[T, None], Tuple[None, tuple]]:
    """Validate request JSON against the given Pydantic model."""
    try:
        data = request.get_json(force=True, silent=True) or {}
        return model.model_validate(data), None
    except ValidationError as exc:
        return None, (jsonify({"error": "validation_error", "details": exc.errors()}), 400)
