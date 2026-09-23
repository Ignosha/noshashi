from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta

router = APIRouter()

class SocialMention(BaseModel):
    source: str
    ticker: str
    content: str
    author: str
    timestamp: datetime
    sentiment: str
    sentiment_score: float
    engagement: int
    url: str

class SentimentResponse(BaseModel):
    ticker: str
    overall_sentiment: str
    sentiment_score: float
    mention_count: int
    trending_score: float
    sources: dict
    top_mentions: List[SocialMention]
    time_range: str

class TrendingTicker(BaseModel):
    ticker: str
    mention_count: int
    sentiment_score: float
    sources: List[str]
    trending_score: float
    last_updated: datetime

@router.get("/sentiment/{ticker}", response_model=SentimentResponse)
async def get_ticker_sentiment(ticker: str, hours: int = Query(24, le=168)):
    result = await analyze_ticker_sentiment(ticker, hours)
    return result

@router.get("/trending", response_model=List[TrendingTicker])
async def get_trending_tickers(limit: int = Query(20, le=100)):
    trending = await fetch_trending_tickers(limit)
    return trending

@router.get("/mentions/{ticker}", response_model=List[SocialMention])
async def get_ticker_mentions(ticker: str, limit: int = Query(50, le=500)):
    mentions = await fetch_mentions(ticker, limit)
    return mentions

async def analyze_ticker_sentiment(ticker: str, hours: int):
    from app.services.sentiment_service import SentimentService
    sent = SentimentService()
    return await sent.analyze_ticker_detailed(ticker, hours)

async def fetch_trending_tickers(limit: int):
    from app.services.sentiment_service import SentimentService
    sent = SentimentService()
    return await sent.get_trending_tickers(limit)

async def fetch_mentions(ticker: str, limit: int):
    from app.services.sentiment_service import SentimentService
    sent = SentimentService()
    return await sent.get_mentions(ticker, limit)
