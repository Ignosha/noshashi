from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os

from app.routes import institutional, signals, portfolio, social, strategies
from app.middleware.legal_middleware import LegalDisclaimerMiddleware

load_dotenv()

app = FastAPI(
    title="Ignoshashi API",
    description="AI-Powered Market Research & Signal Generation Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LegalDisclaimerMiddleware)

app.include_router(signals.router, prefix="/api/v1/signals", tags=["signals"])
app.include_router(portfolio.router, prefix="/api/v1/portfolio", tags=["portfolio"])
app.include_router(social.router, prefix="/api/v1/social", tags=["social"])
app.include_router(strategies.router, prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(institutional.router, prefix="/api/v1/institutional", tags=["institutional intelligence"])

@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "service": "ignoshashi-backend"}

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )
