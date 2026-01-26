from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, FieldValidationInfo, field_validator


ALLOWED_TYPES = {"percent", "amount"}


class PromoCreatePayload(BaseModel):
    code: str = Field(..., min_length=3, max_length=40)
    description: str = Field("", max_length=240)
    discountType: str = Field(..., pattern="^(percent|amount)$")
    discountValue: float = Field(..., ge=0)
    maxUses: Optional[int] = Field(None, ge=0)
    startsAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return (v or "").strip().upper()

    @field_validator("discountValue")
    @classmethod
    def cap_percentage(cls, v: float, info: FieldValidationInfo):
        discount_type = (info.data or {}).get("discountType")
        if discount_type == "percent" and v > 100:
            raise ValueError("Percent discounts cannot exceed 100")
        return v


class PromoUpdatePayload(BaseModel):
    code: Optional[str] = Field(None, min_length=3, max_length=40)
    description: Optional[str] = Field(None, max_length=240)
    discountType: Optional[str] = Field(None, pattern="^(percent|amount)$")
    discountValue: Optional[float] = Field(None, ge=0)
    maxUses: Optional[int] = Field(None, ge=0)
    startsAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    active: Optional[bool] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return v.strip().upper()

    @field_validator("discountValue")
    @classmethod
    def cap_percentage(cls, v: Optional[float], info: FieldValidationInfo):
        discount_type = (info.data or {}).get("discountType")
        if discount_type == "percent" and v is not None and v > 100:
            raise ValueError("Percent discounts cannot exceed 100")
        return v


class PromoValidatePayload(BaseModel):
    code: str = Field(..., min_length=3, max_length=40)
    cartTotal: float = Field(0, ge=0)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return (v or "").strip().upper()
