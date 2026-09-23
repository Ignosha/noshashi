import os
import httpx
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import json

POLYGON_API_KEY = os.getenv("POLYGON_API_KEY")
POLYGON_BASE_URL = "https://api.polygon.io"

class PolygonService:
    def __init__(self):
        self.api_key = POLYGON_API_KEY
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def get_live_data(self, ticker: str) -> Dict:
        url = f"{POLYGON_BASE_URL}/v2/aggs/ticker/{ticker}/prev"
        params = {"apiKey": self.api_key, "adjusted": "true"}
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    
    async def get_portfolio_positions(self, broker: Optional[str] = None) -> List[Dict]:
        if broker == "alpaca":
            return await self._get_alpaca_positions()
        return []
    
    async def _get_alpaca_positions(self) -> List[Dict]:
        alpaca_key = os.getenv("ALPACA_API_KEY")
        alpaca_secret = os.getenv("ALPACA_SECRET_KEY")
        if not alpaca_key:
            return []
        
        url = "https://paper-api.alpaca.markets/v2/positions"
        headers = {
            "APCA-API-KEY-ID": alpaca_key,
            "APCA-API-SECRET-KEY": alpaca_secret,
        }
        response = await self.client.get(url, headers=headers)
        response.raise_for_status()
        raw = response.json()
        
        positions = []
        for pos in raw:
            positions.append({
                "ticker": pos["symbol"],
                "quantity": float(pos["qty"]),
                "avg_cost": float(pos["avg_entry_price"]),
                "current_price": float(pos["current_price"]),
                "market_value": float(pos["market_value"]),
                "unrealized_pnl": float(pos["unrealized_pl"]),
                "unrealized_pnl_pct": float(pos["unrealized_plpc"]) * 100,
                "day_change": float(pos.get("change_today", 0)),
                "day_change_pct": float(pos.get("change_today_pct", 0)),
            })
        return positions
    
    async def validate_broker_credentials(self, broker: str, api_key: str) -> bool:
        if broker == "alpaca":
            url = "https://paper-api.alpaca.markets/v2/account"
            headers = {
                "APCA-API-KEY-ID": api_key,
                "APCA-API-SECRET-KEY": os.getenv("ALPACA_SECRET_KEY", ""),
            }
            response = await self.client.get(url, headers=headers)
            return response.status_code == 200
        return False
    
    async def get_top_movers(self, limit: int = 20) -> List[Dict]:
        url = f"{POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers"
        params = {"apiKey": self.api_key, "limit": limit}
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("tickers", [])[:limit]
    
    async def search_assets(self, query: str, limit: int = 10) -> List[Dict]:
        url = f"{POLYGON_BASE_URL}/v3/reference/tickers"
        params = {
            "apiKey": self.api_key,
            "search": query,
            "limit": limit,
            "active": "true",
        }
        response = await self.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        return data.get("results", [])
    
    async def get_watchlist_data(self) -> Dict[str, Dict]:
        watchlist = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ", "AMD"]
        data = {}
        for ticker in watchlist:
            try:
                data[ticker] = await self.get_live_data(ticker)
            except Exception:
                continue
        return data
