'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'

const policies = [
  { name: 'Minimum exit liquidity', value: '$5.0M', status: 'Pass' },
  { name: 'Issuer identity review', value: 'Required', status: 'Review' },
  { name: 'Transfer control check', value: 'Enabled', status: 'Pass' },
  { name: 'Counterparty concentration', value: 'Threshold 32%', status: 'Review' },
]

export default function PoliciesPage() {
  const [liquidity, setLiquidity] = useState('')
  const [issuerIdentified, setIssuerIdentified] = useState('true')
  const [clawback, setClawback] = useState('unknown')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const evaluatePolicy = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setResult(null)
    const executableLiquidity = Number(liquidity)
    if (!liquidity || !Number.isFinite(executableLiquidity) || executableLiquidity < 0) {
      setError('Enter a non-negative executable liquidity value.')
      return
    }
    try {
      const response = await fetch('/api/v1/institutional/policies/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executable_liquidity_usd: executableLiquidity,
          issuer_identified: issuerIdentified === 'true' ? true : issuerIdentified === 'false' ? false : null,
          clawback_enabled: clawback === 'true' ? true : clawback === 'false' ? false : null,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Policy evaluation failed.')
      setResult(body)
    } catch (evaluationError) {
      setError(evaluationError instanceof Error ? evaluationError.message : 'Policy evaluation failed.')
    }
  }

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><ShieldCheck className="h-3.5 w-3.5" /> POLICIES</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="data-notice">Policy rules are configuration examples until your institution supplies its thresholds and approval controls.</div>
        <div className="hero-grid">
          <div>
            <p className="section-label">GOVERNANCE</p>
            <h1 className="hero-title">Institutional policy enforcement.</h1>
            <p className="hero-copy">Set the rules, score each asset against them, and maintain transparent reasoning before a decision is approved.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Pass rate</span><span className="status-positive">71%</span></div>
            <div className="metric-figure">18</div>
            <div className="metric-meta">Active policy rules</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">RULE ENGINE</p>
            <h2>Policy matrix</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row header-row">
            <span>Rule</span>
            <span>Config</span>
            <span>Status</span>
          </div>
          {policies.map((item) => (
            <div key={item.name} className="data-row">
              <span>{item.name}</span>
              <span>{item.value}</span>
              <span>{item.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">DETERMINISTIC CHECK</p>
            <h2>Evaluate an asset against the active policy</h2>
          </div>
        </div>
        <form onSubmit={evaluatePolicy} className="policy-form">
          <label>
            Executable liquidity (USD)
            <input value={liquidity} onChange={(event) => setLiquidity(event.target.value)} inputMode="decimal" placeholder="5000000" />
          </label>
          <label>
            Issuer identified
            <select value={issuerIdentified} onChange={(event) => setIssuerIdentified(event.target.value)}>
              <option value="true">Yes</option>
              <option value="false">No</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Clawback
            <select value={clawback} onChange={(event) => setClawback(event.target.value)}>
              <option value="unknown">Unknown</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <button type="submit" className="btn-primary">Evaluate policy</button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {result && (
          <div className="policy-result">
            <div className={`decision decision-${result.decision.toLowerCase().replace(/\s+/g, '-')}`}>{result.decision}</div>
            <strong>{result.primary_reason}</strong>
            <span>Source of truth: {result.source_of_truth}</span>
          </div>
        )}
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Every asset decision traces back to policy configuration, evidence, and review status.</div>
      </footer>
    </div>
  )
}
