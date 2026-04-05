"""Token schemas for authentication."""

from pydantic import BaseModel


class Token(BaseModel):
    """JWT access token response."""

    access_token: str
    token_type: str = "bearer"
    is_admin: bool = False
    is_premium: bool = False


class TokenPayload(BaseModel):
    """Decoded JWT token payload."""

    sub: str
    type: str
    exp: int
