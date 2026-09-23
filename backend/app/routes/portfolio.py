from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class PortfolioPosition(BaseModel):
    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    day_change: float
    day_change_pct: float

class PortfolioSummary(BaseModel):
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    day_change: float
    day_change_pct: float
    positions: List[PortfolioPosition]
    risk_metrics: dict
    last_updated: datetime

class BrokerConnection(BaseModel):
    broker: str
    api_key: str
    connected: bool
    last_sync: Optional[datetime]

@router.get("/", response_model=PortfolioSummary)
async def get_portfolio(broker: Optional[str] = Query(None)):
    summary = await build_portfolio_summary(broker)
    return summary

@router.get("/positions", response_model=List[PortfolioPosition])
async def get_positions(broker: Optional[str] = Query(None)):
    positions = await fetch_positions(broker)
    return positions

@router.post("/connect")
async def connect_broker(connection: BrokerConnection):
    result = await establish_broker_connection(connection)
    return {"status": "connected" if result else "failed", "broker": connection.broker}

@router.get("/risk")
async def get_risk_metrics():
    metrics = await calculate_risk_metrics()
    return metrics

async def build_portfolio_summary(broker):
    from app.services.quantpad_service import QuantPadService
    from app.services.polygon_service import PolygonService
    
    qp = QuantPadService()
    pg = PolygonService()
    
    positions = await fetch_positions(broker)
    
    total_value = sum(p.market_value for p in positions)
    total_pnl = sum(p.unrealized_pnl for p in positions)
    total_pnl_pct = (total_pnl / (total_value - total_pnl) * 100) if (total_value - total_pnl) > 0 else 0
    day_change = sum(p.day_change for p in positions)
    day_change_pct = (day_change / (total_value - day_change) * 100) if (total_value - day_change) > 0 else 0
    
    risk_metrics = await qp.calculate_portfolio_risk(positions)
    
    return PortfolioSummary(
        total_value=total_value,
        total_pnl=total_pnl,
        total_pnl_pct=total_pnl_pct,
        day_change=day_change,
        day_change_pct=day_change_pct,
        positions=positions,
        risk_metrics=risk_metrics,
        last_updated=datetime.utcnow(),
    )

async def fetch_positions(broker):
    from app.services.polygon_service import PolygonService
    
    pg = PolygonService()
    raw_positions = await pg.get_portfolio_positions(broker)
    
    positions = []
    for pos in raw_positions:
        positions.append(PortfolioPosition(
            ticker=pos["ticker"],
            quantity=pos["quantity"],
            avg_cost=pos["avg_cost"],
            current_price=pos["current_price"],
            market_value=pos["market_value"],
            unrealized_pnl=pos["unrealized_pnl"],
            unrealized_pnl_pct=pos["unrealized_pnl_pct"],
            day_change=pos["day_change"],
            day_change_pct=pos["day_change_pct"],
        ))
    return positions

async def establish_broker_connection(connection):
    from app.services.polygon_service import PolygonService
    pg = PolygonService()
    return await pg.validate_broker_credentials(connection.broker, connection.api_key)

async def calculate_risk_metrics():
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    positions = await fetch_positions(None)
    return await qp.calculate_portfolio_risk(positions)
