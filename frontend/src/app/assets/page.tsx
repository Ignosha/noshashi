'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'

const metrics = [
  { label: 'Asset count', value: '4,821', tone: 'accent' },
  { label: 'Issuer coverage', value: '93%', tone: 'success' },
  { label: 'GO rate', value: '71', tone: 'success' },
  { label: 'Hold rate', value: '19', tone: 'warning' },
]

const assets = [
  { name: 'XRP', issuer: 'Ripple reserve', control: 'No ordinary freeze', liquidity: '$13.9K', decision: 'GO' },
  { name: 'RLUSD', issuer: 'Ripple reserve', control: 'Clawback enabled', liquidity: '$884K', decision: 'HOLD' },
  { name: 'AUSD', issuer: 'Issuer review', control: 'Transfer review', liquidity: '$211K', decision: 'NO-GO' },
]

export default function AssetsPage() {
  const [issuer, setIssuer] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadProfile = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setProfile(null)
    if (!issuer.trim()) {
      setError('Enter an XRPL issuer address to query an evidence-backed profile.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/institutional/assets?issuer=${encodeURIComponent(issuer.trim())}`)
      const body = await response.json()
      if (!response.ok || body.available === false) {
        setError(body.reason || 'The XRPL provider did not return an asset profile.')
      } else {
        setProfile(body.assets?.[0] || null)
      }
    } catch {
      setError('Unable to reach the institutional API. Check the backend and XRPL provider configuration.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><ShieldCheck className="h-3.5 w-3.5" /> ASSET INTELLIGENCE</div>
          <Link href="/" className="panel-link">Back to overview</Link>
        </div>
        <div className="data-notice">The index below is an illustrative workspace baseline. Query an issuer below to replace it with provider-backed XRPL evidence.</div>
        <div className="hero-grid">
          <div>
            <p className="section-label">ASSET PASSPORT</p>
            <h1 className="hero-title">Institutional asset profiles.</h1>
            <p className="hero-copy">Map issuers, controls, liquidity, policy fit, and evidence to produce a defensible decision for each asset in scope.</p>
          </div>
          <div className="mini-stack">
            <div className="mini-panel">
              <div className="metric-head"><span>Policy fit</span><span className="status-positive">strong</span></div>
              <div className="metric-figure">87%</div>
              <div className="metric-meta">Coverage against policy thresholds</div>
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <div className="data-notice metric-grid-notice">DEMO WORKSPACE VALUES — replace with configured indexer and policy data.</div>
        {metrics.map((metric) => (
          <div key={metric.label} className={`metric-card tone-${metric.tone}`}>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">PROFILE INDEX</p>
            <h2>Monitored assets</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row header-row">
            <span>Asset</span>
            <span>Issuer</span>
            <span>Control</span>
            <span>Liquidity</span>
            <span>Decision</span>
          </div>
          {assets.map((asset) => (
            <div key={asset.name} className="data-row">
              <span>{asset.name}</span>
              <span>{asset.issuer}</span>
              <span>{asset.control}</span>
              <span>{asset.liquidity}</span>
              <span className={`decision decision-${asset.decision.toLowerCase().replace(/\s+/g, '-')}`}>{asset.decision}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">EVIDENCE QUERY</p>
            <h2>Load an issuer-scoped asset passport</h2>
          </div>
        </div>
        <form onSubmit={loadProfile} className="cta-row">
          <input
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
            placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            aria-label="XRPL issuer address"
            className="passport-input"
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Querying ledger...' : 'Query XRPL'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {profile && (
          <div className="passport-grid">
            <div className="passport-card">
              <div className="passport-kicker">IDENTITY</div>
              <ul>
                <li>Currency: {profile.currency}</li>
                <li>Issuer: {profile.issuer}</li>
                <li>Network: {profile.network}</li>
              </ul>
            </div>
            <div className="passport-card">
              <div className="passport-kicker">CONTROL</div>
              <ul>
                <li>Flags: {profile.control?.flags ?? 'Not returned'}</li>
                <li>Freeze: {profile.control?.freeze ?? 'Not evaluated'}</li>
                <li>Clawback: {profile.control?.clawback ?? 'Not evaluated'}</li>
              </ul>
            </div>
            <div className="passport-card">
              <div className="passport-kicker">ADJUDICATION</div>
              <ul>
                <li>Decision: {profile.decision}</li>
                <li>{profile.decision_reason}</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Asset intelligence remains evidence-backed and policy-driven.</div>
      </footer>
    </div>
  )
}
