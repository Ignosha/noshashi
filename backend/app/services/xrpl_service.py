"""Minimal XRPL JSON-RPC client used by institutional intelligence routes.

The service deliberately returns source metadata with every response. Callers can
distinguish verified ledger observations from an unavailable provider without
falling back to fabricated market data.
"""

from datetime import datetime, timezone
import os
from typing import Any, Dict, Optional

import httpx


class XRPLProviderError(RuntimeError):
    """Raised when the configured XRPL provider cannot be queried."""


class XRPLService:
    def __init__(self, endpoint: Optional[str] = None):
        self.endpoint = endpoint or os.getenv("XRPL_RPC_URL", "https://xrplcluster.com")
        self.timeout = float(os.getenv("XRPL_RPC_TIMEOUT_SECONDS", "8"))

    async def _request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        payload = {"method": method, "params": [params]}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.endpoint, json=payload)
                response.raise_for_status()
                body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise XRPLProviderError(f"XRPL provider request failed: {exc}") from exc

        result = body.get("result", {})
        if result.get("status") == "error" or result.get("error"):
            raise XRPLProviderError(result.get("error_message") or result.get("error") or "XRPL provider error")
        return result

    async def ledger_snapshot(self) -> Dict[str, Any]:
        result = await self._request("ledger", {"ledger_index": "validated", "transactions": False})
        ledger = result.get("ledger", result)
        return {
            "available": True,
            "source": self.endpoint,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "ledger_index": ledger.get("ledger_index"),
            "hash": ledger.get("ledger_hash") or ledger.get("hash"),
            "close_time": ledger.get("close_time"),
            "validated": bool(result.get("validated", True)),
        }

    async def account_snapshot(self, account: str) -> Dict[str, Any]:
        result = await self._request(
            "account_info",
            {"account": account, "ledger_index": "validated", "queue": True},
        )
        account_data = result.get("account_data", {})
        return {
            "available": True,
            "source": self.endpoint,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "account": account,
            "ledger_index": result.get("ledger_index"),
            "sequence": account_data.get("Sequence"),
            "balance_drops": account_data.get("Balance"),
            "flags": account_data.get("Flags", 0),
            "owner_count": account_data.get("OwnerCount"),
            "flags_decoded": self.decode_account_flags(account_data.get("Flags", 0)),
        }

    async def account_lines(self, account: str, limit: int = 400) -> Dict[str, Any]:
        result = await self._request(
            "account_lines",
            {"account": account, "ledger_index": "validated", "limit": limit},
        )
        return {
            "available": True,
            "source": self.endpoint,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "account": account,
            "ledger_index": result.get("ledger_index"),
            "lines": result.get("lines", []),
            "marker": result.get("marker"),
        }

    @staticmethod
    def decode_account_flags(flags: int) -> Dict[str, bool]:
        # XRPL AccountRoot flags documented by the ledger protocol.
        return {
            "lsfDefaultRipple": bool(flags & 0x00800000),
            "lsfDepositAuth": bool(flags & 0x01000000),
            "lsfDisableMaster": bool(flags & 0x00100000),
            "lsfRequireDestTag": bool(flags & 0x00020000),
            "lsfRequireAuth": bool(flags & 0x00040000),
        }
