from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import jwt
import bcrypt
import os

JWT_SECRET = os.getenv("JWT_SECRET", "ignoshashi-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION = 86400

class AuthService:
    async def create_user(self, email: str, password: str, tier: str) -> dict:
        return {
            "id": email,
            "email": email,
            "tier": tier,
            "created_at": datetime.utcnow(),
            "api_calls_remaining": 100 if tier == "free" else 99999,
            "strategies_allowed": 1 if tier == "free" else 999,
            "is_active": True,
        }
    
    async def authenticate(self, email: str, password: str) -> Optional[dict]:
        user = await self.create_user(email, password, "free")
        return user
    
    def create_token(self, user: dict) -> str:
        payload = {
            "sub": user["id"],
            "email": user["email"],
            "tier": user["tier"],
            "exp": datetime.utcnow().timestamp() + JWT_EXPIRATION,
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    def verify_token(self, token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
