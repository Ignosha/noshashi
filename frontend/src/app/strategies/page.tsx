'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Play, BarChart3, Code2 } from 'lucide-react'

interface Strategy {
  id: string
  name: string
  description: string
  category: string
  parameters: any
  backtest_results: any
  created_by: string
  is_public: boolean
  created_at: string
}

interface BacktestRequest {
  strategy_id: string
  ticker: string
  start_date: string
  end_date: string
  initial_capital: number
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [backtesting, setBacktesting] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string>('')
  const [backtestResult, setBacktestResult] = useState<any>(null)
  const [backtestForm, setBacktestForm] = useState<BacktestRequest>({
    strategy_id: '',
    ticker: '',
    start_date: '',
    end_date: '',
    initial_capital: 10000,
  })

  useEffect(() => {
    fetchStrategies()
  }, [])

  const fetchStrategies = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/strategies?limit=50')
      const data = await res.json()
      setStrategies(data)
    } catch (error) {
      console.error('Failed to fetch strategies:', error)
    } finally {
      setLoading(false)
    }
  }

  const runBacktest = async () => {
    if (!backtestForm.strategy_id || !backtestForm.ticker) return

    setBacktesting(true)
    try {
      const res = await fetch('/api/v1/strategies/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backtestForm),
      })
      const data = await res.json()
      setBacktestResult(data)
    } catch (error) {
      console.error('Backtest failed:', error)
    } finally {
      setBacktesting(false)
    }
  }

  const categoryColors: Record<string, string> = {
    'trend_following': 'text-[var(--accent)]',
    'mean_reversion': 'text-[var(--accent-secondary)]',
    'sentiment': 'text-[var(--accent-tertiary)]',
    'volatility': 'text-[var(--warning)]',
  }

  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Code2 className="w-5 h-5 text-[var(--accent-tertiary)]" />
            <h1 className="text-3xl font-semibold tracking-tight">Strategy Lab</h1>
          </div>
          <p className="text-[var(--label-2)] leading-relaxed">
            Browse and backtest quantitative trading strategies. 
            Each strategy is evaluated using historical data with configurable parameters.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Strategies List */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-6">Available Strategies</h2>

            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="card rounded-xl p-6 animate-pulse">
                    <div className="h-5 bg-[var(--border)] rounded w-1/3 mb-4" />
                    <div className="h-4 bg-[var(--border)] rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {strategies.map((strategy) => (
                  <div
                    key={strategy.id}
                    className={`card rounded-xl p-6 cursor-pointer transition-all ${
                      selectedStrategy === strategy.id ? 'border-[var(--accent)] shadow-lg shadow-[rgba(0,240,255,0.1)]' : ''
                    }`}
                    onClick={() => {
                      setSelectedStrategy(strategy.id)
                      setBacktestForm({ ...backtestForm, strategy_id: strategy.id })
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--text)]">{strategy.name}</h3>
                        <span className={`text-xs font-mono ${categoryColors[strategy.category] || 'text-[var(--label-3)]'}`}>
                          {strategy.category.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {strategy.is_public && (
                          <span className="px-2 py-0.5 bg-[rgba(0,255,136,0.1)] text-[var(--success)] text-xs rounded font-mono">PUBLIC</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-[var(--label-2)] mb-4 leading-relaxed">{strategy.description}</p>
                    <div className="flex items-center gap-4 text-xs text-[var(--label-4)]">
                      <span>By {strategy.created_by}</span>
                      <span>{new Date(strategy.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backtest Panel */}
          <div className="lg:col-span-1">
            <div className="card rounded-xl p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-lg font-semibold">Backtest</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Strategy</label>
                  <select
                    value={backtestForm.strategy_id}
                    onChange={(e) => setBacktestForm({ ...backtestForm, strategy_id: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
                  >
                    <option value="">Select strategy...</option>
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Ticker</label>
                  <input
                    type="text"
                    value={backtestForm.ticker}
                    onChange={(e) => setBacktestForm({ ...backtestForm, ticker: e.target.value.toUpperCase() })}
                    placeholder="AAPL"
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono placeholder:text-[var(--label-4)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Start</label>
                    <input
                      type="date"
                      value={backtestForm.start_date}
                      onChange={(e) => setBacktestForm({ ...backtestForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">End</label>
                    <input
                      type="date"
                      value={backtestForm.end_date}
                      onChange={(e) => setBacktestForm({ ...backtestForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm focus:border-[var(--accent)] focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[var(--label-3)] mb-2 font-mono uppercase tracking-wider">Capital</label>
                  <input
                    type="number"
                    value={backtestForm.initial_capital}
                    onChange={(e) => setBacktestForm({ ...backtestForm, initial_capital: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] focus:outline-none transition-colors"
                  />
                </div>

                <button
                  onClick={runBacktest}
                  disabled={backtesting}
                  className="btn-primary w-full"
                >
                  <Play className="w-4 h-4" />
                  {backtesting ? 'Running...' : 'Run Backtest'}
                </button>
              </div>

              {/* Results */}
              {backtestResult && (
                <div className="mt-6 pt-6 border-t border-[var(--line)]">
                  <h3 className="text-base font-semibold mb-4">Results</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--label-3)]">Total Return</span>
                      <span className={`font-mono text-sm ${backtestResult.total_return >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {(backtestResult.total_return * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--label-3)]">Sharpe Ratio</span>
                      <span className="font-mono text-sm text-[var(--accent)]">{backtestResult.sharpe_ratio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--label-3)]">Max Drawdown</span>
                      <span className="font-mono text-sm text-[var(--danger)]">{(backtestResult.max_drawdown * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--label-3)]">Win Rate</span>
                      <span className="font-mono text-sm text-[var(--success)]">{(backtestResult.win_rate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--label-3)]">Total Trades</span>
                      <span className="font-mono text-sm text-[var(--text)]">{backtestResult.total_trades}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
