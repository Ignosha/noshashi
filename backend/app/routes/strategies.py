from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class Strategy(BaseModel):
    id: str
    name: str
    description: str
    category: str
    parameters: dict
    backtest_results: dict
    live_performance: dict
    created_by: str
    is_public: bool
    created_at: datetime
    updated_at: datetime

class BacktestRequest(BaseModel):
    strategy_id: str
    ticker: str
    start_date: str
    end_date: str
    initial_capital: float = 10000.0

class BacktestResult(BaseModel):
    strategy_id: str
    ticker: str
    total_return: float
    annualized_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    total_trades: int
    equity_curve: List[dict]

class OptimizationRequest(BaseModel):
    strategy_id: str
    ticker: str
    parameters: dict
    generations: int = 50
    population_size: int = 100

@router.get("/", response_model=List[Strategy])
async def get_strategies(
    category: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(True),
    limit: int = Query(50, le=200),
):
    strategies = await fetch_strategies(category, is_public, limit)
    return strategies

@router.get("/{strategy_id}", response_model=Strategy)
async def get_strategy(strategy_id: str):
    strategy = await fetch_strategy(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy

@router.post("/backtest", response_model=BacktestResult)
async def run_backtest(request: BacktestRequest):
    result = await execute_backtest(request)
    return result

@router.post("/optimize")
async def optimize_strategy(request: OptimizationRequest):
    result = await run_optimization(request)
    return result

@router.post("/deploy")
async def deploy_strategy(strategy_id: str, ticker: str, parameters: dict):
    result = await deploy_to_paper_trading(strategy_id, ticker, parameters)
    return result

async def fetch_strategies(category, is_public, limit):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.list_strategies(category, is_public, limit)

async def fetch_strategy(strategy_id):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.get_strategy(strategy_id)

async def execute_backtest(request):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.backtest(
        request.strategy_id, request.ticker,
        request.start_date, request.end_date,
        request.initial_capital
    )

async def run_optimization(request):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.optimize(
        request.strategy_id, request.ticker,
        request.parameters, request.generations,
        request.population_size
    )

async def deploy_to_paper_trading(strategy_id, ticker, parameters):
    from app.services.quantpad_service import QuantPadService
    qp = QuantPadService()
    return await qp.deploy(strategy_id, ticker, parameters)
