from pydantic import BaseModel, Field
from typing import Optional


class RasaHandoffPayload(BaseModel):
    sender_id: str = Field(..., min_length=1, max_length=120)
    last_message: str = Field("", max_length=1000)
    customer_id: Optional[str] = Field(None, max_length=120)


class CSATPayload(BaseModel):
    session_id: Optional[str] = Field(None, min_length=1, max_length=120)
    sender_id: Optional[str] = Field(None, min_length=1, max_length=120)
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=1000)
    token: Optional[str] = Field(None, max_length=256)
