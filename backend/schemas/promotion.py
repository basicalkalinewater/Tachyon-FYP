from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class PromotionCreatePayload(BaseModel):
    name: str = ""
    scopeType: str = Field(..., pattern="^(product|category)$")
    productId: Optional[str] = None
    category: Optional[str] = None
    discountType: str = Field(..., pattern="^(percent|amount)$")
    discountValue: float = Field(..., ge=0)
    startsAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    active: bool = True

    @field_validator("discountValue")
    @classmethod
    def validate_discount_value(cls, v, info):
        discount_type = (info.data or {}).get("discountType")
        if discount_type == "percent" and v > 100:
            raise ValueError("Percent discounts cannot exceed 100")
        return v

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scopeType == "product":
            if not self.productId:
                raise ValueError("productId is required for product promotions")
            if self.category:
                raise ValueError("category must be empty for product promotions")
        if self.scopeType == "category":
            if not self.category:
                raise ValueError("category is required for category promotions")
            if self.productId:
                raise ValueError("productId must be empty for category promotions")
        return self


class PromotionUpdatePayload(BaseModel):
    name: Optional[str] = None
    scopeType: Optional[str] = Field(None, pattern="^(product|category)$")
    productId: Optional[str] = None
    category: Optional[str] = None
    discountType: Optional[str] = Field(None, pattern="^(percent|amount)$")
    discountValue: Optional[float] = Field(None, ge=0)
    startsAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    active: Optional[bool] = None

    @field_validator("discountValue")
    @classmethod
    def validate_discount_value(cls, v, info):
        discount_type = (info.data or {}).get("discountType")
        if discount_type == "percent" and v is not None and v > 100:
            raise ValueError("Percent discounts cannot exceed 100")
        return v

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scopeType == "product":
            if not self.productId:
                raise ValueError("productId is required for product promotions")
            if self.category:
                raise ValueError("category must be empty for product promotions")
        if self.scopeType == "category":
            if not self.category:
                raise ValueError("category is required for category promotions")
            if self.productId:
                raise ValueError("productId must be empty for category promotions")
        return self
