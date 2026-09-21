"""Small durable evidence and adjudication store.

This keeps the institutional workflow usable before the production PostgreSQL
schema is deployed. The schema is intentionally append-only for evidence,
policy evaluations, and monitoring events.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class EvidenceStore:
    def __init__(self, database_path: Optional[str] = None):
        configured_path = database_path or os.getenv("NOSHASHI_EVIDENCE_DB", "data/noshashi_evidence.sqlite3")
        self.path = Path(configured_path)
        if self.path.parent != Path("."):
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS evidence_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT NOT NULL,
                    evidence_type TEXT NOT NULL,
                    source TEXT,
                    observed_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS policy_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT,
                    decision TEXT NOT NULL,
                    primary_reason TEXT NOT NULL,
                    evaluated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS monitoring_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    acknowledged INTEGER NOT NULL DEFAULT 0
                );
                """
            )

    def add_evidence(self, subject: str, evidence_type: str, source: Optional[str], payload: Dict[str, Any]) -> Dict[str, Any]:
        observed_at = payload.get("observed_at") or _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO evidence_snapshots(subject, evidence_type, source, observed_at, payload) VALUES (?, ?, ?, ?, ?)",
                (subject, evidence_type, source, observed_at, json.dumps(payload)),
            )
            return {
                "id": cursor.lastrowid,
                "subject": subject,
                "evidence_type": evidence_type,
                "source": source,
                "observed_at": observed_at,
                "payload": payload,
            }

    def add_policy_evaluation(self, subject: Optional[str], result: Dict[str, Any]) -> Dict[str, Any]:
        evaluated_at = result.get("evaluated_at") or _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO policy_evaluations(subject, decision, primary_reason, evaluated_at, payload) VALUES (?, ?, ?, ?, ?)",
                (subject, result["decision"], result["primary_reason"], evaluated_at, json.dumps(result)),
            )
            return {"id": cursor.lastrowid, "subject": subject, **result}

    def add_event(self, subject: str, severity: str, event_type: str, detail: str) -> Dict[str, Any]:
        created_at = _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO monitoring_events(subject, severity, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?)",
                (subject, severity, event_type, detail, created_at),
            )
            return {
                "id": cursor.lastrowid,
                "subject": subject,
                "severity": severity,
                "event_type": event_type,
                "detail": detail,
                "created_at": created_at,
                "acknowledged": False,
            }

    def list_evidence(self, subject: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        query = "SELECT * FROM evidence_snapshots"
        params: List[Any] = []
        if subject:
            query += " WHERE subject = ?"
            params.append(subject)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        with self._connect() as connection:
            return [self._evidence_row(row) for row in connection.execute(query, params).fetchall()]

    def list_evaluations(self, subject: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        query = "SELECT * FROM policy_evaluations"
        params: List[Any] = []
        if subject:
            query += " WHERE subject = ?"
            params.append(subject)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        with self._connect() as connection:
            return [self._evaluation_row(row) for row in connection.execute(query, params).fetchall()]

    def list_events(self, subject: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        query = "SELECT * FROM monitoring_events"
        params: List[Any] = []
        if subject:
            query += " WHERE subject = ?"
            params.append(subject)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        with self._connect() as connection:
            return [dict(row) for row in connection.execute(query, params).fetchall()]

    @staticmethod
    def _evidence_row(row: sqlite3.Row) -> Dict[str, Any]:
        result = dict(row)
        result["payload"] = json.loads(result["payload"])
        return result

    @staticmethod
    def _evaluation_row(row: sqlite3.Row) -> Dict[str, Any]:
        result = json.loads(row["payload"])
        result["id"] = row["id"]
        result["subject"] = row["subject"]
        return result


store = EvidenceStore()
