from typing import Any, Dict, List, Optional


def simulate_execution(
    *,
    side: str,
    position_size: float,
    available_depth: Optional[float],
    quoted_price: Optional[float],
    max_slippage_percent: float,
) -> Dict[str, Any]:
    """Return a deterministic estimate, never a transaction result."""
    if available_depth is None or quoted_price is None:
        return {
            "available": False,
            "estimate": True,
            "status": "INSUFFICIENT DATA",
            "reason": "Available depth and quoted price are required for an execution estimate.",
        }

    executable_amount = min(position_size, available_depth)
    fill_ratio = executable_amount / position_size
    depth_ratio = position_size / available_depth if available_depth else float("inf")
    estimated_slippage = min(100.0, depth_ratio * 2.0)
    estimated_price_impact = estimated_slippage * 0.75
    failure_conditions: List[str] = []

    if executable_amount < position_size:
        failure_conditions.append("Available depth is smaller than requested position size.")
    if estimated_slippage > max_slippage_percent:
        failure_conditions.append("Estimated slippage exceeds the configured maximum.")

    return {
        "available": True,
        "estimate": True,
        "status": "ESTIMATE ONLY",
        "side": side,
        "requested_amount": position_size,
        "estimated_executable_amount": executable_amount,
        "remaining_depth": max(0.0, available_depth - executable_amount),
        "quoted_price": quoted_price,
        "estimated_slippage_percent": round(estimated_slippage, 6),
        "estimated_price_impact_percent": round(estimated_price_impact, 6),
        "fill_ratio": round(fill_ratio, 6),
        "failure_conditions": failure_conditions,
        "methodology": "Deterministic depth-ratio estimate; not a completed transaction or execution guarantee.",
    }
