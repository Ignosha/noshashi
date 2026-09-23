from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.xrpl_service import XRPLProviderError, XRPLService
from app.services.evidence_store import store
from app.models.institutional import LiquiditySimulationRequest
from app.services.liquidity_service import simulate_execution

router = APIRouter()


class PolicyCheckRequest(BaseModel):
    executable_liquidity_usd: Optional[float] = Field(None, ge=0)
    minimum_executable_liquidity_usd: float = Field(5_000_000, ge=0)
    clawback_enabled: Optional[bool] = None
    issuer_identified: Optional[bool] = None
    concentration_percent: Optional[float] = Field(None, ge=0, le=100)
    maximum_concentration_percent: float = Field(32, ge=0, le=100)


def _unavailable(reason: str) -> Dict[str, Any]:
    return {
        "available": False,
        "source": None,
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
    }


@router.get("/network")
async def get_network_snapshot():
    try:
        return await XRPLService().ledger_snapshot()
    except XRPLProviderError as exc:
        return _unavailable(str(exc))


@router.get("/assets")
async def get_assets(
    issuer: Optional[str] = Query(None, min_length=25, max_length=35),
    currency: Optional[str] = Query(None, min_length=3, max_length=40),
):
    if not issuer:
        return {"available": False, "assets": [], "reason": "issuer is required for an evidence-backed XRPL profile"}

    try:
        account = await XRPLService().account_snapshot(issuer)
    except XRPLProviderError as exc:
        return {"available": False, "assets": [], "reason": str(exc)}

    asset = {
        "currency": currency or "unknown",
        "issuer": issuer,
        "network": "XRPL",
        "identity": {"issuer_identified": True, "first_observed": None, "domain": None},
        "control": {
            "flags": account.get("flags"),
            "flags_decoded": account.get("flags_decoded"),
            "freeze": None,
            "deep_freeze": None,
            "clawback": None,
            "transfer_restrictions": None,
        },
        "evidence": [account],
        "decision": "HOLD",
        "decision_reason": "Liquidity and control evidence require additional issuer and market sources.",
    }
    return {"available": True, "assets": [asset], "source": account["source"], "observed_at": account["observed_at"]}


@router.get("/assets/{asset_id}/liquidity")
async def get_asset_liquidity(asset_id: str):
    return {
        "available": False,
        "asset": asset_id,
        "status": "DATA UNAVAILABLE",
        "reason": "Configure XRPL order-book and AMM providers before publishing liquidity observations.",
        "observed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/assets/{asset_id}/liquidity/simulate")
async def simulate_asset_liquidity(asset_id: str, request: LiquiditySimulationRequest):
    result = simulate_execution(
        side=request.side,
        position_size=request.position_size,
        available_depth=request.available_depth,
        quoted_price=request.quoted_price,
        max_slippage_percent=request.max_slippage_percent,
    )
    return {"asset": asset_id, **result}


@router.get("/evidence")
async def get_evidence(issuer: Optional[str] = Query(None, min_length=25, max_length=35)):
    if not issuer:
        return {
            "available": True,
            "records": store.list_evidence(limit=100),
            "reason": "Pass issuer to query live ledger evidence.",
        }

    try:
        service = XRPLService()
        account = await service.account_snapshot(issuer)
        ledger = await service.ledger_snapshot()
    except XRPLProviderError as exc:
        return {"available": False, "records": store.list_evidence(issuer, 100), "reason": str(exc)}

    records = [
        store.add_evidence(issuer, "account_info", account["source"], account),
        store.add_evidence(str(ledger.get("ledger_index")), "validated_ledger", ledger["source"], ledger),
    ]
    return {
        "available": True,
        "records": records,
    }


@router.post("/policies/check")
async def check_policy(request: PolicyCheckRequest, subject: Optional[str] = Query(None)):
    liquidity_known = request.executable_liquidity_usd is not None
    concentration_known = request.concentration_percent is not None
    checks: List[Dict[str, Any]] = [
        {
            "key": "executable_liquidity",
            "status": "pass" if liquidity_known and request.executable_liquidity_usd >= request.minimum_executable_liquidity_usd else "unknown" if not liquidity_known else "fail",
            "observed": request.executable_liquidity_usd,
            "threshold": request.minimum_executable_liquidity_usd,
            "reason": "No executable market-depth source was supplied." if not liquidity_known else None,
        },
        {
            "key": "issuer_identified",
            "status": "pass" if request.issuer_identified is True else "unknown" if request.issuer_identified is None else "fail",
            "observed": request.issuer_identified,
        },
        {
            "key": "clawback",
            "status": "review" if request.clawback_enabled is True else "pass" if request.clawback_enabled is False else "unknown",
            "observed": request.clawback_enabled,
        },
        {
            "key": "counterparty_concentration",
            "status": "pass" if concentration_known and request.concentration_percent <= request.maximum_concentration_percent else "unknown" if not concentration_known else "fail",
            "observed": request.concentration_percent,
            "threshold": request.maximum_concentration_percent,
        },
    ]

    statuses = {check["status"] for check in checks}
    if "fail" in statuses:
        decision, reason = "NO-GO", "At least one configured institutional threshold failed."
    elif "unknown" in statuses or "review" in statuses:
        decision, reason = "HOLD", "Required evidence is incomplete or requires human review."
    else:
        decision, reason = "GO", "All supplied deterministic policy checks passed."

    result = {
        "decision": decision,
        "primary_reason": reason,
        "checks": checks,
        "source_of_truth": "deterministic policy evaluation",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }
    stored = store.add_policy_evaluation(subject, result)
    if decision != "GO" and subject:
        store.add_event(subject, "HIGH" if decision == "NO-GO" else "MEDIUM", "policy_decision", reason)
    return stored


@router.get("/history")
async def get_history(subject: Optional[str] = Query(None), limit: int = Query(100, ge=1, le=500)):
    return {
        "subject": subject,
        "evidence": store.list_evidence(subject, limit),
        "evaluations": store.list_evaluations(subject, limit),
        "events": store.list_events(subject, limit),
    }


@router.get("/monitoring/events")
async def get_monitoring_events(subject: Optional[str] = Query(None), limit: int = Query(100, ge=1, le=500)):
    return {"events": store.list_events(subject, limit)}


@router.post("/monitoring/events")
async def create_monitoring_event(
    subject: str,
    severity: str = Query(..., pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$"),
    event_type: str = Query(..., min_length=2, max_length=80),
    detail: str = Query(..., min_length=2, max_length=500),
):
    return store.add_event(subject, severity, event_type, detail)


@router.get("/overview")
async def get_institutional_overview():
    network = await get_network_snapshot()
    return {
        "product": "NOSHASHI",
        "mode": "XRPL institutional intelligence",
        "data": {
            "network": network,
            "assets": _unavailable("Asset count requires a configured indexer or issuer-scoped query."),
            "liquidity": _unavailable("Liquidity requires configured order-book and AMM data sources."),
            "counterparties": _unavailable("Counterparty graph requires configured indexer data."),
        },
        "pipeline": ["data", "evidence", "deterministic_analysis", "policy", "interpretation", "adjudication", "monitoring", "audit"],
    }
