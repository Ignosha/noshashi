'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, BellRing } from 'lucide-react'

interface MonitoringEvent {
  title: string
  detail: string
  stamp: string
  severity: string
}

const previewTimeline: MonitoringEvent[] = [
  { title: 'Liquidity alert', detail: 'Executable depth dipped below operating threshold for 4 hours.', stamp: '09:12 UTC', severity: 'PREVIEW' },
  { title: 'Control review', detail: 'Issuer change event flagged for manual review.', stamp: '08:41 UTC', severity: 'PREVIEW' },
  { title: 'Policy check', detail: 'Policy engine added new transfer restriction evaluation.', stamp: '07:19 UTC', severity: 'PREVIEW' },
]

export default function MonitoringPage() {
  const [events, setEvents] = useState(previewTimeline)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/v1/institutional/monitoring/events')
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (Array.isArray(body?.events) && body.events.length > 0) {
          setEvents(body.events.map((event: { severity: string; event_type: string; detail: string; created_at: string }): MonitoringEvent => ({
            title: event.event_type.replace(/_/g, ' '),
            detail: event.detail,
            stamp: new Date(event.created_at).toLocaleString(),
            severity: event.severity,
          })))
          setConnected(true)
        }
      })
      .catch(() => setConnected(false))
  }, [])

  return (
    <div className="noshashi-shell">
      <section className="hero-panel">
        <div className="panel-header compact">
          <div className="chip chip-primary"><BellRing className="h-3.5 w-3.5" /> MONITORING</div>
          <Link href="/" className="panel-link">Overview</Link>
        </div>
        <div className="hero-grid">
          <div>
            <p className="section-label">ALERTING</p>
            <h1 className="hero-title">Continuous event monitoring.</h1>
            <p className="hero-copy">Track changes in liquidity, issuer controls, policy drift, and exposure events in a real-time operational stack.</p>
          </div>
          <div className="mini-panel">
            <div className="metric-head"><span>Event source</span><span className={connected ? 'status-positive' : 'status-warning'}>{connected ? 'connected' : 'preview'}</span></div>
            <div className="metric-figure">{events.length.toString().padStart(2, '0')}</div>
            <div className="metric-meta">Stored monitoring events</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">EVENT FEED</p>
            <h2>Monitoring queue</h2>
          </div>
        </div>
        {!connected && <div className="data-notice">No persisted monitoring events are available yet. The feed below is a clearly labeled preview baseline.</div>}
        <div className="stack-list">
          {events.map((item) => (
            <div key={item.title} className="list-item">
              <div className={`severity severity-${item.severity.toLowerCase()}`}>{item.severity}</div>
              <div>
                <div className="list-title">{item.title}</div>
                <div className="list-copy">{item.detail}</div>
              </div>
              <div className="list-subtitle">{item.stamp}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-text"><ArrowUpRight className="h-4 w-4" /> Monitoring keeps institutional change detection visible, explainable, and auditable.</div>
      </footer>
    </div>
  )
}
