from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field


Decision = Literal["GO", "HOLD", "NO-GO"]


class EvidenceRecord(BaseModel):
    id: Optional[int] = None
    subject: str
    evidence_type: str
    source: Optional[str] = None
    observed_at: datetime
    payload: Dict[str, Any]


class PolicyEvaluation(BaseModel):
    decision: Decision
    primary_reason: str
    checks: List[Dict[str, Any]]
    source_of_truth: str = "deterministic policy evaluation"
    evaluated_at: datetime


class LiquiditySimulationRequest(BaseModel):
    side: Literal["buy", "sell"]
    position_size: float = Field(..., gt=0)
    available_depth: Optional[float] = Field(None, ge=0)
    quoted_price: Optional[float] = Field(None, gt=0)
    max_slippage_percent: float = Field(2.0, ge=0, le=100)

