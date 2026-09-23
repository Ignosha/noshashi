'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldCheck, Bell, ArrowUpRight } from 'lucide-react'

export default function Header() {
  const [time, setTime] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }
      setTime(now.toLocaleTimeString('en-US', options))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const navLinks = [
    { href: '/', label: 'Console' },
    { href: '/assets', label: 'Assets' },
    { href: '/liquidity', label: 'Liquidity' },
    { href: '/monitoring', label: 'Monitoring' },
    { href: '/evidence', label: 'Evidence' },
    { href: '/developers', label: 'Developers' },
    { href: '/enterprise', label: 'Enterprise' },
    { href: '/strategic-infrastructure', label: 'Infrastructure' },
    { href: '/pricing', label: 'Pricing' },
  ]

  return (
    <header className="site-header">
      <div className="header-top">
        <div className="flex items-center gap-3 min-w-0">
          <div className="brand-mark">N</div>
          <Link
            href="/"
            className="brand-lockup"
            style={{ fontVariationSettings: '"wght" 700, "wdth" 120' }}
          >
            NOSHASHI
          </Link>
          <span className="header-kicker hidden xl:inline-block">
            Digital Asset Intelligence Infrastructure
          </span>
        </div>

        <nav className="hidden xl:flex items-center gap-1 flex-wrap justify-center">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${
                pathname === link.href ? 'text-[var(--text)]' : 'text-[var(--label-2)]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button className="utility-btn hidden lg:inline-flex items-center gap-2 text-[var(--label-2)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            XRPL
          </button>
          <button className="utility-btn hidden md:inline-flex items-center gap-2 text-[var(--label-2)]">
            <Bell className="h-3.5 w-3.5" />
            Alerts
          </button>
          <div className="clock-chip hidden lg:flex items-center gap-2">
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--success)]" />
            {time}
          </div>
        </div>
      </div>

      <div className="header-bottom border-t border-[var(--line)]">
        <div className="lg:hidden text-xs uppercase tracking-[0.22em] text-[var(--label-3)]">
          {time || 'SYNC'}
        </div>
        <div className="hidden lg:block uppercase tracking-[0.2em] text-[var(--label-3)]">
          Institutional Intelligence
        </div>
        <div className="hidden lg:flex items-center gap-4 uppercase tracking-[0.18em] text-[var(--label-4)]">
          <span>v1.0.0</span>
          <span>XRPL</span>
          <span>Policy Mode</span>
        </div>
      </div>
    </header>
  )
}
