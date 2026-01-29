from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class CreateUserPayload(BaseModel):
    email: EmailStr
    role: str = Field(..., pattern="^(customer|support|admin)$")
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=40)
    status: Optional[str] = Field("active", pattern="^(active|disabled)$")

