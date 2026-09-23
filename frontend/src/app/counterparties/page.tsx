'use client'

import Link from 'next/link'
import { Users, ArrowUpRight } from 'lucide-react'

const counterparties = [
  { entity: 'Sunset Trading', role: 'Market maker', exposure: '$14.8M', risk: 'Moderate' },
  { entity: 'Northbridge OTC', role: 'Liquidity partner', exposure: '$8.1M', risk: 'Low' },
  { entity: 'Atlas Vault', role: 'Custodian', exposure: '$21.5M', risk: 'Elevated' },
]

export default function CounterpartiesPage() {
  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><Users className="h-3.5 w-3.5" /> COUNTERPARTIES</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">ENTITY RISK</p>
            <h1 className="hero-title">Counterparty exposure and controls.</h1>
            <p className="hero-copy">Track wallet concentration, settlement pathways, market makers, and related entities to understand who can transact and under what conditions.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Top exposure</span><span className="status-warning">elevated</span></div>
            <div className="metric-figure">$21.5M</div>
            <div className="metric-meta">Custodian concentration</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">EXPOSURE MAP</p>
            <h2>Key counterparties</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row header-row">
            <span>Entity</span>
            <span>Role</span>
            <span>Exposure</span>
            <span>Risk</span>
          </div>
          {counterparties.map((item) => (
            <div key={item.entity} className="data-row">
              <span>{item.entity}</span>
              <span>{item.role}</span>
              <span>{item.exposure}</span>
              <span>{item.risk}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Counterparty review requires both formal controls and transaction traceability.</div>
      </footer>
    </div>
  )
}
