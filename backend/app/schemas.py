# schemas.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

class RegisterStartRequest(BaseModel):
    display_name: str
    device_name: Optional[str] = "Navegador Web"

class RegisterFinishRequest(BaseModel):
    session_id: str
    display_name: str
    device_name: str
    webauthn_response: dict

class LoginFinishRequest(BaseModel):
    session_id: str
    webauthn_response: dict

class AddPasskeyStartRequest(BaseModel):
    device_name: str

class PasskeyResponse(BaseModel):
    id: uuid.UUID
    device_name: str
    created_at: datetime
    last_used: Optional[datetime]

class UserProfileResponse(BaseModel):
    id: uuid.UUID
    display_name: str
    created_at: datetime
    last_login: Optional[datetime]
    passkeys: List[PasskeyResponse]
    discoveries_count: int
    achievements_count: int
    favorites_count: int
    settings: Optional[dict]