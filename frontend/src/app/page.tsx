'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Globe2, ShieldCheck } from 'lucide-react'

interface Signal {
  id: string
  ticker: string
  signal_type: string
  confidence: number
  entry_price: number
  target_price: number
  stop_loss: number
  timeframe: string
  strategy: string
  ai_summary: string
}

interface InstitutionalOverview {
  data?: {
    network?: {
      available?: boolean
      ledger_index?: number
      validated?: boolean
      observed_at?: string
      reason?: string
    }
  }
}

const demoSignals: Signal[] = [
  { id: 'sig-1', ticker: 'XRP', signal_type: 'buy', confidence: 0.89, entry_price: 0.64, target_price: 0.72, stop_loss: 0.58, timeframe: '24h', strategy: 'Liquidity + Volume', ai_summary: 'Intraday breakout sustained above structural support with improving order-book depth.' },
  { id: 'sig-2', ticker: 'USDX', signal_type: 'hold', confidence: 0.71, entry_price: 0.99, target_price: 1.02, stop_loss: 0.96, timeframe: '7d', strategy: 'Policy Lens', ai_summary: 'Stable behavior with elevated transfer restriction review and issuer identity monitoring.' },
  { id: 'sig-3', ticker: 'RLUSD', signal_type: 'buy', confidence: 0.84, entry_price: 1.0, target_price: 1.06, stop_loss: 0.95, timeframe: '48h', strategy: 'Counterparty Flow', ai_summary: 'Liquidity concentration improved while reserve activity remains consistent with institutional thresholds.' },
]

const demoAlerts = [
  { severity: 'HIGH', title: 'Control change detected', asset: 'XRP/USD', detail: 'Issuer control signal triggered after wallet concentration spike.' },
  { severity: 'MEDIUM', title: 'Liquidity deterioration', asset: 'AUSD', detail: 'Executable depth is below configured exit threshold for 4h.' },
  { severity: 'LOW', title: 'Policy drift', asset: 'USDC', detail: 'Transfer restriction policy requires manual review.' },
]

const recentAnalyses = [
  { asset: 'XRP', decision: 'GO', reason: 'Executable liquidity exceeds policy floor', time: '09:12 UTC' },
  { asset: 'RLUSD', decision: 'HOLD', reason: 'Issuer identity update pending validation', time: '08:41 UTC' },
  { asset: 'AUSD', decision: 'NO-GO', reason: 'Counterparty concentration risk elevated', time: '07:18 UTC' },
]

const commandStats = [
  { label: 'TOTAL ASSETS', value: '4,821', tone: 'accent' },
  { label: 'ANALYZED VALUE', value: '$84.7M', tone: 'success' },
  { label: 'GO', value: '71', tone: 'success' },
  { label: 'HOLD', value: '19', tone: 'warning' },
  { label: 'NO-GO', value: '7', tone: 'danger' },
  { label: 'ALERTS', value: '12', tone: 'accent' },
]

export default function Home() {
  const [signals, setSignals] = useState<Signal[]>(demoSignals)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<InstitutionalOverview | null>(null)

  useEffect(() => {
    let isMounted = true

    Promise.all([
      fetch('/api/v1/signals?limit=3').then((res) => (res.ok ? res.json() : demoSignals)),
      fetch('/api/v1/institutional/overview').then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([sigData, overviewData]) => {
        if (!isMounted) return
        setSignals(Array.isArray(sigData) && sigData.length ? sigData : demoSignals)
        setOverview(overviewData)
      })
      .catch(() => {
        if (!isMounted) return
        setSignals(demoSignals)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary">
            <Activity className="h-3.5 w-3.5" />
            NOSHASHI COMMAND
          </div>
          <div className="chip chip-subtle">XRPL Intelligence Layer</div>
        </div>
        <div className="data-notice">
          Workspace preview data is clearly marked until live XRPL, liquidity, and counterparty providers are configured.
        </div>
        <div className="chip chip-subtle">DEMO WORKSPACE VALUES</div>

        <div className="hero-grid">
          <div>
            <p className="section-label">MISSION CONTROL</p>
            <h1 className="hero-title">Digital asset risk and liquidity intelligence.</h1>
            <p className="hero-copy">
              Evaluate issuers, control conditions, liquidity depth, counterparties, and policy compliance with deterministic evidence-first analysis.
            </p>
            <div className="cta-row">
              <Link href="/assets" className="btn-primary">
                View Asset Passport
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/evidence" className="btn-secondary">
                View Evidence
              </Link>
            </div>
          </div>

          <div className="mini-stack">
            <div className="mini-panel">
              <div className="metric-head">
                <span>Portfolio status</span>
                <span className="status-positive">stable</span>
              </div>
              <div className="metric-figure">$84.7M</div>
              <div className="metric-meta">Monitored exposure</div>
            </div>
            <div className="mini-panel muted">
              <div className="metric-head">
                <span>Decision mix</span>
                <span className="status-warning">review</span>
              </div>
              <div className="metric-figure small">71 / 19 / 7</div>
              <div className="metric-meta">GO / HOLD / NO-GO</div>
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid metrics-6">
        {commandStats.map((stat) => (
          <div key={stat.label} className={`metric-card tone-${stat.tone}`}>
            <div className="metric-label">{stat.label}</div>
            <div className="metric-value">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="page-grid">
        <div className="panel span-2">
          <div className="panel-header">
            <div>
              <p className="section-label">LIVE XRPL</p>
              <h2>Network pulse</h2>
            </div>
            <span className={`chip ${overview?.data?.network?.available ? 'chip-success' : 'chip-subtle'}`}>
              {overview?.data?.network?.available ? 'Connected' : 'Provider setup required'}
            </span>
          </div>

          <div className="status-grid">
            <div className="status-card">
              <div className="status-label">LATEST LEDGER</div>
              <div className="status-value">
                {overview?.data?.network?.available && overview.data.network.ledger_index
                  ? `#${overview.data.network.ledger_index.toLocaleString()}`
                  : 'Unavailable'}
              </div>
            </div>
            <div className="status-card">
              <div className="status-label">VALIDATION</div>
              <div className="status-value">
                {overview?.data?.network?.available
                  ? overview.data.network.validated ? 'Validated' : 'Unverified'
                  : 'Awaiting provider'}
              </div>
            </div>
            <div className="status-card">
              <div className="status-label">NETWORK STATUS</div>
              <div className="status-value">{overview?.data?.network?.available ? 'Operational' : 'Not connected'}</div>
            </div>
            <div className="status-card">
              <div className="status-label">FRESHNESS</div>
              <div className="status-value">
                {overview?.data?.network?.available && overview.data.network.observed_at
                  ? new Date(overview.data.network.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'Unavailable'}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">ALERTS</p>
              <h2>Active review</h2>
            </div>
          </div>
          <div className="stack-list">
            {demoAlerts.map((alert) => (
              <div key={alert.title} className="list-item alert-row">
                <div className={`severity severity-${alert.severity.toLowerCase()}`}>{alert.severity}</div>
                <div>
                  <div className="list-title">{alert.title}</div>
                  <div className="list-subtitle">{alert.asset}</div>
                </div>
                <div className="list-copy">{alert.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-grid">
        <div className="panel span-2">
          <div className="panel-header">
            <div>
              <p className="section-label">RECENT ANALYSES</p>
              <h2>Decision stream</h2>
            </div>
            <Link href="/research" className="panel-link">Open research</Link>
          </div>

          <div className="data-table">
            <div className="data-row header-row">
              <span>Asset</span>
              <span>Decision</span>
              <span>Reason</span>
              <span>Timestamp</span>
            </div>
            {recentAnalyses.map((item) => (
              <div key={`${item.asset}-${item.time}`} className="data-row">
                <span>{item.asset}</span>
                <span className={`decision decision-${item.decision.toLowerCase()}`}>{item.decision}</span>
                <span>{item.reason}</span>
                <span>{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">ASSET SIGNALS</p>
              <h2>Live readout</h2>
            </div>
          </div>

          {loading ? (
            <div className="signal-list">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="signal-card skeleton" />
              ))}
            </div>
          ) : (
            <div className="signal-list">
              {signals.map((signal) => (
                <div key={signal.id} className="signal-card">
                  <div className="signal-line">
                    <span className="signal-ticker">{signal.ticker}</span>
                    <span className={`signal-badge signal-${signal.signal_type}`}>{signal.signal_type.toUpperCase()}</span>
                  </div>
                  <div className="signal-metrics">
                    <span>{(signal.confidence * 100).toFixed(0)}% confidence</span>
                    <span>{signal.timeframe}</span>
                  </div>
                  <p>{signal.ai_summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">ASSET PASSPORT</p>
            <h2>Institutional profile</h2>
          </div>
          <Link href="/assets" className="panel-link">Explore asset intelligence</Link>
        </div>

        <div className="passport-grid">
          <div className="passport-card">
            <div className="passport-kicker">IDENTITY</div>
            <ul>
              <li>Issuer: Ripple-managed reserve</li>
              <li>Network: XRPL</li>
              <li>Domain: stablecoin policy</li>
            </ul>
          </div>
          <div className="passport-card">
            <div className="passport-kicker">CONTROL</div>
            <ul>
              <li>Freeze: no ordinary freeze</li>
              <li>Clawback: enabled</li>
              <li>Restrictions: transfer review needed</li>
            </ul>
          </div>
          <div className="passport-card">
            <div className="passport-kicker">LIQUIDITY</div>
            <ul>
              <li>Executable depth: $13.9K</li>
              <li>Required threshold: $5.0M</li>
              <li>Slippage: 0.42%</li>
            </ul>
          </div>
          <div className="passport-card">
            <div className="passport-kicker">ADJUDICATION</div>
            <ul>
              <li>Decision: HOLD</li>
              <li>Reason: liquidity below policy floor</li>
              <li>Evidence: ledger + transaction chain</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text">
          <ShieldCheck className="h-4 w-4" />
          Deterministic evidence. Human policy oversight. No tactical advice without review.
        </div>
        <div className="bottom-links">
          <Link href="/legal/disclaimer">Disclaimer</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/tos">Terms</Link>
        </div>
      </footer>
    </div>
  )
}
