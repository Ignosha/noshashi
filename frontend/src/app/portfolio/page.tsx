'use client'

import { useState, useEffect } from 'react'
import { Wallet, RefreshCw } from 'lucide-react'

interface Position {
  ticker: string
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  day_change: number
  day_change_pct: number
}

interface PortfolioSummary {
  total_value: number
  total_pnl: number
  total_pnl_pct: number
  day_change: number
  day_change_pct: number
  positions: Position[]
  risk_metrics: any
  last_updated: string
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [broker, setBroker] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (connected) {
      fetchPortfolio()
    }
  }, [connected])

  const fetchPortfolio = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (broker) params.append('broker', broker)

      const res = await fetch(`/api/v1/portfolio?${params}`)
      const data = await res.json()
      setPortfolio(data)
    } catch (error) {
      console.error('Failed to fetch portfolio:', error)
    } finally {
      setLoading(false)
    }
  }

  const connectBroker = async () => {
    try {
      const res = await fetch('/api/v1/portfolio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker, api_key: apiKey }),
      })
      const data = await res.json()
      if (data.status === 'connected') {
        setConnected(true)
      }
    } catch (error) {
      console.error('Connection failed:', error)
    }
  }

  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="w-5 h-5 text-[var(--accent-tertiary)]" />
            <h1 className="text-3xl font-semibold tracking-tight">Portfolio Tracker</h1>
          </div>
          <p className="text-[var(--label-2)] leading-relaxed">
            Connect your broker account to track your portfolio in real-time. 
            Read-only access — we never store your credentials.
          </p>
        </div>

        {!connected ? (
          <div className="card rounded-xl p-8 max-w-2xl">
            <h2 className="text-xl font-semibold mb-6">Connect Your Broker</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Broker</label>
                <select
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:border-[var(--accent-tertiary)] focus:outline-none transition-colors"
                >
                  <option value="">Select broker...</option>
                  <option value="alpaca">Alpaca</option>
                  <option value="tradier">Tradier</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono placeholder:text-[var(--label-4)] focus:border-[var(--accent-tertiary)] focus:outline-none transition-colors"
                />
              </div>
              <button 
                onClick={connectBroker}
                className="btn-primary w-full"
              >
                Connect
              </button>
              <p className="text-xs text-[var(--label-4)] text-center">
                Your credentials are encrypted and never stored. Read-only access only.
              </p>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="text-center py-20">
                <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin text-[var(--accent-tertiary)]" />
                <p className="text-[var(--label-2)]">Loading portfolio...</p>
              </div>
            ) : portfolio && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                  <div className="card rounded-xl p-6">
                    <div className="text-xs text-[var(--label-3)] mb-1 font-mono uppercase tracking-wider">Total Value</div>
                    <div className="text-2xl font-bold text-[var(--text)] tabular-nums">${portfolio.total_value.toLocaleString()}</div>
                  </div>
                  <div className="card rounded-xl p-6">
                    <div className="text-xs text-[var(--label-3)] mb-1 font-mono uppercase tracking-wider">Total P&L</div>
                    <div className={`text-2xl font-bold tabular-nums ${portfolio.total_pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {portfolio.total_pnl >= 0 ? '+' : ''}${portfolio.total_pnl.toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 ${portfolio.total_pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {portfolio.total_pnl >= 0 ? '+' : ''}{portfolio.total_pnl_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="card rounded-xl p-6">
                    <div className="text-xs text-[var(--label-3)] mb-1 font-mono uppercase tracking-wider">Day Change</div>
                    <div className={`text-2xl font-bold tabular-nums ${portfolio.day_change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {portfolio.day_change >= 0 ? '+' : ''}${portfolio.day_change.toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 ${portfolio.day_change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {portfolio.day_change >= 0 ? '+' : ''}{portfolio.day_change_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="card rounded-xl p-6">
                    <div className="text-xs text-[var(--label-3)] mb-1 font-mono uppercase tracking-wider">Risk Score</div>
                    <div className="text-2xl font-bold text-[var(--warning)] tabular-nums">
                      {portfolio.risk_metrics?.max_drawdown?.toFixed(1) || 'N/A'}%
                    </div>
                    <div className="text-sm text-[var(--label-3)]">Max Drawdown</div>
                  </div>
                </div>

                {/* Positions */}
                <div className="card rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-[var(--line)]">
                    <h2 className="text-lg font-semibold">Positions</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[var(--bg-secondary)]">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Ticker</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Qty</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Avg Cost</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Price</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Value</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">P&L</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-[var(--label-3)] uppercase tracking-wider">Day</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {portfolio.positions.map((pos, i) => (
                          <tr key={i} className="hover:bg-[rgba(var(--label-d),0.02)] transition-colors">
                            <td className="px-6 py-4 font-semibold text-[var(--text)]">{pos.ticker}</td>
                            <td className="px-6 py-4 text-right font-mono text-sm text-[var(--label-2)]">{pos.quantity.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-mono text-sm text-[var(--label-2)]">${pos.avg_cost.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-mono text-sm text-[var(--label-2)]">${pos.current_price.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text)]">${pos.market_value.toLocaleString()}</td>
                            <td className={`px-6 py-4 text-right font-mono text-sm ${pos.unrealized_pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                              <div className="text-xs">({pos.unrealized_pnl_pct >= 0 ? '+' : ''}{pos.unrealized_pnl_pct.toFixed(2)}%)</div>
                            </td>
                            <td className={`px-6 py-4 text-right font-mono text-sm ${pos.day_change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                              {pos.day_change >= 0 ? '+' : ''}${pos.day_change.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
