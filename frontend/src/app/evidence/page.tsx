'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'

const evidence = [
  { name: 'Ledger snapshot', source: 'Provider-backed ledger reference', weight: 'Primary evidence' },
  { name: 'Issuer event record', source: 'Configured source required', weight: 'Supporting' },
  { name: 'Liquidity transaction trace', source: 'Configured market source required', weight: 'Supporting' },
]

export default function EvidencePage() {
  const [records, setRecords] = useState<any[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/v1/institutional/evidence')
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (Array.isArray(body?.records) && body.records.length > 0) {
          setRecords(body.records)
          setConnected(true)
        }
      })
      .catch(() => setConnected(false))
  }, [])

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><FileText className="h-3.5 w-3.5" /> EVIDENCE</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">AUDIT TRAIL</p>
            <h1 className="hero-title">Evidence-backed adjudication.</h1>
            <p className="hero-copy">Every decision must be traceable to the exact ledger state, transaction path, policy configuration, and review event behind it.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Evidence chain</span><span className="status-positive">complete</span></div>
            <div className="metric-figure">4</div>
            <div className="metric-meta">Sources attached</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">VERIFICATION</p>
            <h2>Evidence ledger</h2>
          </div>
        </div>
        {!connected && <div className="data-notice">No issuer-scoped evidence has been queried yet. The table below is a preview of the audit record shape.</div>}
        <div className="data-table">
          <div className="data-row header-row">
            <span>Artifact</span>
            <span>Source</span>
            <span>Weight</span>
          </div>
          {(connected ? records.map((item) => ({
            name: item.evidence_type,
            source: item.source || 'Unknown source',
            weight: item.observed_at,
          })) : evidence).map((item) => (
            <div key={item.name} className="data-row">
              <span>{item.name}</span>
              <span>{item.source}</span>
              <span>{item.weight}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Deterministic analysis remains visible, reviewable, and reproducible.</div>
      </footer>
    </div>
  )
}
