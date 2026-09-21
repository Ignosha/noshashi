'use client'

import Link from 'next/link'
import { ArrowUpRight, Settings2 } from 'lucide-react'

const settings = [
  { name: 'Workspace mode', value: 'Policy-first' },
  { name: 'Alerting', value: 'Enabled' },
  { name: 'Evidence retention', value: '180 days' },
  { name: 'Approval cadence', value: 'Daily review' },
]

export default function SettingsPage() {
  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><Settings2 className="h-3.5 w-3.5" /> SETTINGS</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">OPERATIONS</p>
            <h1 className="hero-title">Institutional configuration.</h1>
            <p className="hero-copy">Tune monitoring thresholds, policy guardrails, retention requirements, and user workflows without sacrificing auditability.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Compliance</span><span className="status-positive">aligned</span></div>
            <div className="metric-figure">24/7</div>
            <div className="metric-meta">Monitoring posture</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">CONFIGURATION</p>
            <h2>System controls</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row header-row">
            <span>Control</span>
            <span>Value</span>
          </div>
          {settings.map((item) => (
            <div key={item.name} className="data-row">
              <span>{item.name}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Settings govern the operational layer while source-of-truth analysis remains deterministic.</div>
      </footer>
    </div>
  )
}
