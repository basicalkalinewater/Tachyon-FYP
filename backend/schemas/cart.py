from pydantic import BaseModel, Field


class AddCartItemPayload(BaseModel):
    productId: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(..., ge=1, le=20)

