from pydantic import BaseModel, EmailStr, Field


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    fullName: str = Field("", max_length=120)

