
import re
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Literal

# User Registration Schema
class UserRegister(BaseModel):
    full_name: str = Field(
        ...,
        min_length=3,
        max_length=150,
        description="Full legal name (3 to 150 characters)",
    )

    email: EmailStr = Field(
        ...,
        description="Valid email address",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password must contain at least 8 characters, with letters and digits",
    )

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v



# User Login Schema
class UserLogin(BaseModel):
    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )


# User Response Schema
class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    is_active: bool

    model_config = ConfigDict(
        from_attributes=True,
    )


# JWT Token Response Schema
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

# Refresh Token Request Schema
class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserUpdate(BaseModel):
    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    email: EmailStr | None = None

    role: Literal["admin", "staff", "donor", "user"] | None = None

    is_active: bool | None = None


# Password Management Schemas
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(
        ...,
        min_length=1,
        description="Current account password",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (min 8 chars, uppercase, lowercase, digit, special character)",
    )
    confirm_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Confirmation of new password",
    )

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\/`~]", v):
            raise ValueError("Password must contain at least one special character")
        return v


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (min 8 chars, uppercase, lowercase, digit, special character)",
    )
    confirm_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Confirmation of new password",
    )

    @field_validator("new_password")
    @classmethod
    def validate_admin_reset_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\/`~]", v):
            raise ValueError("Password must contain at least one special character")
        return v


class MessageResponse(BaseModel):
    message: str
    detail: str | None = None
