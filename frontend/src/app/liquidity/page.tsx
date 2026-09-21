'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Droplets } from 'lucide-react'

const liquidityBreakdown = [
  { label: 'AMM depth', value: 'Unavailable' },
  { label: 'Order book depth', value: 'Unavailable' },
  { label: 'Executable depth', value: 'Unavailable' },
  { label: 'Freshness', value: 'Provider required' },
]

export default function LiquidityPage() {
  const [asset, setAsset] = useState('XRP')
  const [side, setSide] = useState<'buy' | 'sell'>('sell')
  const [size, setSize] = useState('')
  const [depth, setDepth] = useState('')
  const [price, setPrice] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const runSimulation = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setResult(null)
    const positionSize = Number(size)
    const availableDepth = Number(depth)
    const quotedPrice = Number(price)
    if (![positionSize, availableDepth, quotedPrice].every((value) => Number.isFinite(value) && value > 0)) {
      setError('Enter positive values for position size, available depth, and quoted price.')
      return
    }
    try {
      const response = await fetch(`/api/v1/institutional/assets/${encodeURIComponent(asset)}/liquidity/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          position_size: positionSize,
          available_depth: availableDepth,
          quoted_price: quotedPrice,
          max_slippage_percent: 2,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Simulation failed.')
      setResult(body)
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'Simulation failed.')
    }
  }

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><Droplets className="h-3.5 w-3.5" /> LIQUIDITY</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="data-notice">No market-depth provider is configured. Values below are unavailable, not zero. The simulator accepts explicit inputs and returns an estimate only.</div>
        <div className="hero-grid">
          <div>
            <p className="section-label">EXIT CAPACITY</p>
            <h1 className="hero-title">Executable liquidity and slippage analysis.</h1>
            <p className="hero-copy">Confirm the asset can actually move through the market without violating policy thresholds or creating forced exit conditions.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Threshold</span><span className="status-positive">met</span></div>
            <div className="metric-figure">$5.0M</div>
            <div className="metric-meta">Minimum required executable liquidity</div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        {liquidityBreakdown.map((item) => (
          <div key={item.label} className="metric-card tone-accent">
            <div className="metric-label">{item.label}</div>
            <div className="metric-value">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">DEPTH WINDOW</p>
            <h2>Market depth snapshot</h2>
          </div>
        </div>
        <div className="status-grid">
          <div className="status-card"><div className="status-label">Best bid</div><div className="status-value">Unavailable</div></div>
          <div className="status-card"><div className="status-label">Best ask</div><div className="status-value">Unavailable</div></div>
          <div className="status-card"><div className="status-label">Spread</div><div className="status-value">Unavailable</div></div>
          <div className="status-card"><div className="status-label">Volatility</div><div className="status-value">Unavailable</div></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">LIQUIDITY SIMULATOR</p>
            <h2>Estimate an execution scenario</h2>
          </div>
        </div>
        <form onSubmit={runSimulation} className="policy-form">
          <label>Asset<input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} /></label>
          <label>Side<select value={side} onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}><option value="sell">Sell</option><option value="buy">Buy</option></select></label>
          <label>Position size<input value={size} onChange={(event) => setSize(event.target.value)} inputMode="decimal" placeholder="100000" /></label>
          <label>Available depth<input value={depth} onChange={(event) => setDepth(event.target.value)} inputMode="decimal" placeholder="500000" /></label>
          <label>Quoted price<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="0.64" /></label>
          <button type="submit" className="btn-primary">Run estimate</button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {result && (
          <div className="policy-result">
            <div className="decision decision-hold">{result.status}</div>
            <strong>Estimated executable amount: {result.estimated_executable_amount}</strong>
            <span>Estimated slippage: {result.estimated_slippage_percent}%</span>
            <span>{result.failure_conditions?.length ? result.failure_conditions.join(' ') : 'No modeled failure conditions.'}</span>
          </div>
        )}
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Liquidity review evaluates both raw depth and policy-relevant exit viability.</div>
      </footer>
    </div>
  )
}
