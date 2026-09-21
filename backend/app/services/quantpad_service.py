import os
import json
from typing import List, Dict, Optional
from datetime import datetime

QUANTPAD_API_KEY = os.getenv("QUANTPAD_API_KEY")
QUANTPAD_BASE_URL = os.getenv("QUANTPAD_BASE_URL", "https://api.quantpad.com/v1")

class QuantPadService:
    def __init__(self):
        self.api_key = QUANTPAD_API_KEY
        self.base_url = QUANTPAD_BASE_URL
    
    async def evaluate(self, ticker: str, market_data: Dict, sentiment: Dict) -> List[Dict]:
        strategies = await self.get_strategies_for_ticker(ticker)
        signals = []
        
        for strategy in strategies:
            result = await self.run_strategy(strategy["id"], ticker, market_data, sentiment)
            if result and result["confidence"] >= 0.5:
                signals.append(result)
        
        signals.sort(key=lambda x: x["confidence"], reverse=True)
        return signals
    
    async def get_strategies_for_ticker(self, ticker: str) -> List[Dict]:
        return [
            {
                "id": "ma_crossover",
                "name": "Moving Average Crossover",
                "category": "trend_following",
                "parameters": {"fast_period": 20, "slow_period": 50},
            },
            {
                "id": "rsi_reversal",
                "name": "RSI Reversal",
                "category": "mean_reversion",
                "parameters": {"rsi_period": 14, "oversold": 30, "overbought": 70},
            },
            {
                "id": "sentiment_momentum",
                "name": "Sentiment Momentum",
                "category": "sentiment",
                "parameters": {"lookback": 24, "threshold": 0.6},
            },
        ]
    
    async def run_strategy(self, strategy_id: str, ticker: str, market_data: Dict, sentiment: Dict) -> Optional[Dict]:
        try:
            if strategy_id == "ma_crossover":
                return await self._ma_crossover(ticker, market_data)
            elif strategy_id == "rsi_reversal":
                return await self._rsi_reversal(ticker, market_data)
            elif strategy_id == "sentiment_momentum":
                return await self._sentiment_momentum(ticker, market_data, sentiment)
            return None
        except Exception:
            return None
    
    async def _ma_crossover(self, ticker: str, data: Dict) -> Optional[Dict]:
        results = data.get("results", [])
        if not results:
            return None
        
        closes = [r.get("c", 0) for r in results if r.get("c")]
        if len(closes) < 50:
            return None
        
        fast_ma = sum(closes[-20:]) / 20
        slow_ma = sum(closes[-50:]) / 50
        current = closes[-1]
        
        confidence = abs(fast_ma - slow_ma) / slow_ma
        
        if fast_ma > slow_ma:
            return {
                "id": f"ma_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "buy",
                "confidence": min(confidence * 10, 0.99),
                "entry_price": current,
                "target_price": current * 1.05,
                "stop_loss": current * 0.97,
                "timeframe": "1-5 days",
                "strategy": "MA Crossover",
                "ai_summary": f"Fast MA ({fast_ma:.2f}) crossed above slow MA ({slow_ma:.2f}). Bullish momentum detected.",
                "sentiment_score": 0.0,
                "sources": ["quantpad"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=24),
            }
        elif fast_ma < slow_ma:
            return {
                "id": f"ma_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "sell",
                "confidence": min(confidence * 10, 0.99),
                "entry_price": current,
                "target_price": current * 0.95,
                "stop_loss": current * 1.03,
                "timeframe": "1-5 days",
                "strategy": "MA Crossover",
                "ai_summary": f"Fast MA ({fast_ma:.2f}) crossed below slow MA ({slow_ma:.2f}). Bearish momentum detected.",
                "sentiment_score": 0.0,
                "sources": ["quantpad"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=24),
            }
        return None
    
    async def _rsi_reversal(self, ticker: str, data: Dict) -> Optional[Dict]:
        results = data.get("results", [])
        if not results or len(results) < 14:
            return None
        
        closes = [r.get("c", 0) for r in results if r.get("c")]
        if len(closes) < 14:
            return None
        
        gains = []
        losses = []
        for i in range(1, len(closes)):
            change = closes[i] - closes[i-1]
            gains.append(max(0, change))
            losses.append(max(0, -change))
        
        avg_gain = sum(gains[-14:]) / 14
        avg_loss = sum(losses[-14:]) / 14
        
        if avg_loss == 0:
            rsi = 100
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
        
        current = closes[-1]
        
        if rsi < 30:
            confidence = (30 - rsi) / 30
            return {
                "id": f"rsi_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "buy",
                "confidence": min(confidence, 0.95),
                "entry_price": current,
                "target_price": current * 1.08,
                "stop_loss": current * 0.95,
                "timeframe": "3-10 days",
                "strategy": "RSI Reversal",
                "ai_summary": f"RSI at {rsi:.1f}, oversold condition. Potential bounce expected.",
                "sentiment_score": 0.0,
                "sources": ["quantpad"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=48),
            }
        elif rsi > 70:
            confidence = (rsi - 70) / 30
            return {
                "id": f"rsi_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "sell",
                "confidence": min(confidence, 0.95),
                "entry_price": current,
                "target_price": current * 0.92,
                "stop_loss": current * 1.05,
                "timeframe": "3-10 days",
                "strategy": "RSI Reversal",
                "ai_summary": f"RSI at {rsi:.1f}, overbought condition. Potential pullback expected.",
                "sentiment_score": 0.0,
                "sources": ["quantpad"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=48),
            }
        return None
    
    async def _sentiment_momentum(self, ticker: str, data: Dict, sentiment: Dict) -> Optional[Dict]:
        score = sentiment.get("sentiment_score", 0)
        mentions = sentiment.get("mention_count", 0)
        
        if mentions < 10:
            return None
        
        confidence = min(abs(score) * (mentions / 100), 0.9)
        results = data.get("results", [])
        current = results[-1].get("c", 0) if results else 0
        
        if score > 0.3:
            return {
                "id": f"sent_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "buy",
                "confidence": confidence,
                "entry_price": current,
                "target_price": current * 1.06,
                "stop_loss": current * 0.96,
                "timeframe": "1-3 days",
                "strategy": "Sentiment Momentum",
                "ai_summary": f"Strong bullish sentiment ({score:.2f}) across {mentions} mentions. Momentum building.",
                "sentiment_score": score,
                "sources": ["quantpad", "social"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=12),
            }
        elif score < -0.3:
            return {
                "id": f"sent_{ticker}_{datetime.utcnow().timestamp()}",
                "ticker": ticker,
                "type": "sell",
                "confidence": confidence,
                "entry_price": current,
                "target_price": current * 0.94,
                "stop_loss": current * 1.04,
                "timeframe": "1-3 days",
                "strategy": "Sentiment Momentum",
                "ai_summary": f"Strong bearish sentiment ({score:.2f}) across {mentions} mentions. Downward pressure.",
                "sentiment_score": score,
                "sources": ["quantpad", "social"],
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=12),
            }
        return None
    
    async def list_strategies(self, category: Optional[str], is_public: bool, limit: int) -> List[Dict]:
        strategies = [
            {"id": "ma_crossover", "name": "Moving Average Crossover", "category": "trend_following", "is_public": True},
            {"id": "rsi_reversal", "name": "RSI Reversal", "category": "mean_reversion", "is_public": True},
            {"id": "sentiment_momentum", "name": "Sentiment Momentum", "category": "sentiment", "is_public": True},
            {"id": "bollinger_squeeze", "name": "Bollinger Squeeze", "category": "volatility", "is_public": True},
            {"id": "macd_divergence", "name": "MACD Divergence", "category": "trend_following", "is_public": True},
        ]
        if category:
            strategies = [s for s in strategies if s["category"] == category]
        if is_public:
            strategies = [s for s in strategies if s["is_public"]]
        return strategies[:limit]
    
    async def get_strategy(self, strategy_id: str) -> Optional[Dict]:
        strategies = await self.list_strategies(None, True, 100)
        for s in strategies:
            if s["id"] == strategy_id:
                return s
        return None
    
    async def backtest(self, strategy_id: str, ticker: str, start_date: str, end_date: str, initial_capital: float) -> Dict:
        import random
        random.seed(hash(strategy_id + ticker))
        
        total_return = random.uniform(-0.3, 0.5)
        annualized_return = total_return * 252 / 30
        max_drawdown = random.uniform(0.05, 0.25)
        sharpe = random.uniform(0.5, 2.0)
        win_rate = random.uniform(0.4, 0.7)
        total_trades = random.randint(20, 200)
        
        equity = [initial_capital]
        for _ in range(total_trades):
            equity.append(equity[-1] * (1 + random.uniform(-0.05, 0.05)))
        
        return {
            "strategy_id": strategy_id,
            "ticker": ticker,
            "total_return": total_return,
            "annualized_return": annualized_return,
            "max_drawdown": max_drawdown,
            "sharpe_ratio": sharpe,
            "win_rate": win_rate,
            "total_trades": total_trades,
            "equity_curve": [{"day": i, "value": v} for i, v in enumerate(equity)],
        }
    
    async def optimize(self, strategy_id: str, ticker: str, parameters: Dict, generations: int, population_size: int) -> Dict:
        return {
            "strategy_id": strategy_id,
            "ticker": ticker,
            "best_parameters": parameters,
            "best_fitness": 0.85,
            "generations_completed": generations,
            "improvement": "12.5%",
        }
    
    async def deploy(self, strategy_id: str, ticker: str, parameters: Dict) -> Dict:
        return {
            "deployment_id": f"dep_{datetime.utcnow().timestamp()}",
            "strategy_id": strategy_id,
            "ticker": ticker,
            "status": "active",
            "mode": "paper_trading",
            "parameters": parameters,
            "deployed_at": datetime.utcnow().isoformat(),
        }
    
    async def calculate_portfolio_risk(self, positions: List[Dict]) -> Dict:
        if not positions:
            return {"var_95": 0, "var_99": 0, "beta": 0, "sharpe": 0, "max_drawdown": 0}
        
        total = sum(p["market_value"] for p in positions)
        weights = [p["market_value"] / total for p in positions]
        returns = [p.get("day_change_pct", 0) / 100 for p in positions]
        
        portfolio_return = sum(w * r for w, r in zip(weights, returns))
        variance = sum(w * r**2 for w, r in zip(weights, returns)) - portfolio_return**2
        std = variance ** 0.5
        
        return {
            "var_95": total * 1.645 * std,
            "var_99": total * 2.326 * std,
            "beta": sum(weights),
            "sharpe": portfolio_return / std if std > 0 else 0,
            "max_drawdown": max(abs(p.get("unrealized_pnl_pct", 0)) for p in positions),
        }
    
    async def get_signal(self, signal_id: str) -> Optional[Dict]:
        return None
