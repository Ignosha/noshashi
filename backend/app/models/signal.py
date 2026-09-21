from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict

class User(BaseModel):
    id: str
    email: str
    tier: str
    created_at: datetime
    api_calls_remaining: int
    strategies_allowed: int
    is_active: bool

class Signal(BaseModel):
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

class Position(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    day_change: float
    day_change_pct: float

class Portfolio(BaseModel):
    user_id: str
    broker: str
    positions: List[Position]
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    risk_metrics: Dict
    last_updated: datetime

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

class Strategy(BaseModel):
    id: str
    name: str
    description: str
    category: str
    parameters: Dict
    backtest_results: Dict
    live_performance: Dict
    created_by: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
