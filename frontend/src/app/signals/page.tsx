'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Activity, Filter, RefreshCw } from 'lucide-react'

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
  sentiment_score: number
  sources: string[]
  created_at: string
  expires_at: string
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [filter, setFilter] = useState({ ticker: '', type: '', minConfidence: 0.5 })

  useEffect(() => {
    fetchSignals()
  }, [filter])

  const fetchSignals = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.ticker) params.append('ticker', filter.ticker)
      if (filter.type) params.append('signal_type', filter.type)
      params.append('min_confidence', filter.minConfidence.toString())
      params.append('limit', '100')

      const res = await fetch(`/api/v1/signals?${params}`)
      const data = await res.json()
      setSignals(data)
    } catch (error) {
      console.error('Failed to fetch signals:', error)
    } finally {
      setLoading(false)
    }
  }

  const runScan = async () => {
    setScanning(true)
    try {
      await fetch('/api/v1/signals/scan', { method: 'POST' })
      await fetchSignals()
    } catch (error) {
      console.error('Scan failed:', error)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-3xl font-semibold tracking-tight">Signal Scanner</h1>
          </div>
          <p className="text-[var(--label-2)] leading-relaxed">
            Real-time quantitative signal generation across multiple strategies. 
            Signals are generated based on technical indicators, social sentiment, and AI analysis.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button 
              onClick={runScan}
              disabled={scanning}
              className="btn-primary"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Run Scan'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="code-block mb-10">
          <div className="code-block-header">
            <span className="code-block-lang">Filters</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Ticker</label>
                <input
                  type="text"
                  placeholder="AAPL"
                  value={filter.ticker}
                  onChange={(e) => setFilter({ ...filter, ticker: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono placeholder:text-[var(--label-4)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Type</label>
                <select
                  value={filter.type}
                  onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
                >
                  <option value="">All Types</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="hold">Hold</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Min Confidence</label>
                <input
                  type="number"
                  placeholder="0.5"
                  value={filter.minConfidence}
                  onChange={(e) => setFilter({ ...filter, minConfidence: parseFloat(e.target.value) || 0 })}
                  min="0"
                  max="1"
                  step="0.1"
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono placeholder:text-[var(--label-4)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                />
              </div>
              <div className="flex items-end">
                <button 
                  onClick={fetchSignals}
                  className="w-full px-4 py-2 border border-[var(--accent)] text-[var(--accent)] rounded-lg hover:bg-[rgba(0,240,255,0.05)] transition-colors text-sm font-medium"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Signals */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card rounded-xl p-6 animate-pulse">
                <div className="h-5 bg-[var(--border)] rounded w-1/3 mb-4" />
                <div className="h-4 bg-[var(--border)] rounded w-2/3 mb-2" />
                <div className="h-4 bg-[var(--border)] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-20">
            <Activity className="w-12 h-12 mx-auto mb-4 text-[var(--label-4)]" />
            <p className="text-[var(--label-2)]">No signals found. Try adjusting your filters or run a market scan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {signals.map((signal) => (
              <div key={signal.id} className="card rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text)]">{signal.ticker}</h3>
                    <span className={`inline-block px-2 py-0.5 text-xs font-mono rounded mt-1 ${
                      signal.signal_type === 'buy' ? 'bg-[rgba(0,255,136,0.1)] text-[var(--success)]' :
                      signal.signal_type === 'sell' ? 'bg-[rgba(255,0,68,0.1)] text-[var(--danger)]' :
                      'bg-[rgba(255,238,0,0.1)] text-[var(--warning)]'
                    }`}>
                      {signal.signal_type.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[var(--accent)]">{(signal.confidence * 100).toFixed(0)}%</div>
                    <div className="text-xs text-[var(--label-3)]">confidence</div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--label-3)]">Entry</span>
                    <span className="text-[var(--text)] font-mono text-xs">${signal.entry_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--label-3)]">Target</span>
                    <span className="text-[var(--success)] font-mono text-xs">${signal.target_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--label-3)]">Stop Loss</span>
                    <span className="text-[var(--danger)] font-mono text-xs">${signal.stop_loss.toFixed(2)}</span>
                  </div>
                </div>

                <p className="text-sm text-[var(--label-2)] mb-4 leading-relaxed">{signal.ai_summary}</p>

                <div className="flex items-center justify-between text-xs text-[var(--label-4)]">
                  <span className="font-mono">{signal.strategy}</span>
                  <span>{signal.timeframe}</span>
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--line)]">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {signal.sources.map((source, i) => (
                        <span key={i} className="px-2 py-0.5 bg-[rgba(157,78,221,0.1)] text-[var(--accent-tertiary)] text-xs rounded font-mono">
                          {source}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-[var(--label-4)]">
                      {new Date(signal.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
