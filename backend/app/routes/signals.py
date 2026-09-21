from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import os

router = APIRouter()

class SignalResponse(BaseModel):
    id: str
    ticker: str
    signal_type: str
    confidence: float
    entry_price: float
    target_price: float
    stop_loss: float
    timeframe: str
    strategy: str
    ai_summary: str
    sentiment_score: float
    sources: List[str]
    created_at: datetime
    expires_at: datetime

class SignalFilter(BaseModel):
    ticker: Optional[str] = None
    signal_type: Optional[str] = None
    min_confidence: float = 0.5
    timeframe: Optional[str] = None

@router.get("/", response_model=List[SignalResponse])
async def get_signals(
    ticker: Optional[str] = Query(None),
    signal_type: Optional[str] = Query(None),
    min_confidence: float = Query(0.5),
    timeframe: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    signals = await generate_signals(ticker, signal_type, min_confidence, timeframe, limit)
    return signals

@router.get("/{signal_id}", response_model=SignalResponse)
async def get_signal(signal_id: str):
    signal = await get_signal_by_id(signal_id)
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return signal

@router.post("/scan")
async def scan_market():
    result = await run_market_scan()
    return {"status": "completed", "signals_found": len(result), "timestamp": datetime.utcnow()}

async def generate_signals(ticker, signal_type, min_confidence, timeframe, limit):
    from app.services.quantpad_service import QuantPadService
    from app.services.polygon_service import PolygonService
    from app.services.sentiment_service import SentimentService
    
    qp = QuantPadService()
    pg = PolygonService()
    sent = SentimentService()
    
    watchlist = ticker.split(",") if ticker else ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ"]
    
    signals = []
    for t in watchlist:
        try:
            data = await pg.get_live_data(t)
            sentiment = await sent.analyze_ticker(t)
            qp_signals = await qp.evaluate(t, data, sentiment)
            
            for sig in qp_signals:
                if sig["confidence"] >= min_confidence:
                    if signal_type and sig["type"] != signal_type:
                        continue
                    if timeframe and sig["timeframe"] != timeframe:
                        continue
                    signals.append(sig)
        except Exception as e:
            continue
    
    signals.sort(key=lambda x: x["confidence"], reverse=True)
    return signals[:limit]

async def get_signal_by_id(signal_id: str):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.get_signal(signal_id)

async def run_market_scan():
    from app.services.quantpad_service import QuantPadService
    from app.services.polygon_service import PolygonService
    from app.services.sentiment_service import SentimentService
    
    qp = QuantPadService()
    pg = PolygonService()
    sent = SentimentService()
    
    results = []
    watchlist = await pg.get_watchlist_data()
    
    for ticker, data in watchlist.items():
        sentiment = await sent.analyze_ticker(ticker)
        sigs = await qp.evaluate(ticker, data, sentiment)
        results.extend(sigs)
    
    return results
