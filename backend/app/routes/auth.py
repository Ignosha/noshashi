from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import jwt
import os

router = APIRouter()
security = HTTPBearer()

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    tier: str = "free"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    tier: str

@router.post("/register", response_model=TokenResponse)
async def register(user: UserRegister):
    result = await create_user(user.email, user.password, user.tier)
    return result

@router.post("/login", response_model=TokenResponse)
async def login(user: UserLogin):
    result = await authenticate_user(user.email, user.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return result

@router.get("/me")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await verify_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

async def create_user(email: str, password: str, tier: str):
    from app.models.user import User
    from app.services.auth_service import AuthService
    
    auth = AuthService()
    user = await auth.create_user(email, password, tier)
    token = auth.create_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=86400,
        tier=user.tier,
    )

async def authenticate_user(email: str, password: str):
    from app.services.auth_service import AuthService
    auth = AuthService()
    user = await auth.authenticate(email, password)
    if not user:
        return None
    token = auth.create_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=86400,
        tier=user.tier,
    )

async def verify_token(token: str):
    from app.services.auth_service import AuthService
    auth = AuthService()
    return auth.verify_token(token)
