import Link from 'next/link'
import EnterprisePricingCard from '@/components/pricing/EnterprisePricingCard'
import StrategicPricingCard from '@/components/pricing/StrategicPricingCard'

const comparison = [
  ['Asset intelligence', '✓', '✓', '✓'],
  ['Issuer intelligence', '✓', '✓', '✓'],
  ['Liquidity intelligence', '✓', '✓', '✓'],
  ['Counterparty intelligence', 'Limited', '✓', '✓'],
  ['Policy engine and adjudication', '—', '✓', '✓'],
  ['Evidence infrastructure', 'Limited', '✓', '✓'],
  ['Monitoring', 'Limited', '✓', '✓'],
  ['Institutional API', 'Limited', '✓', '✓'],
  ['Webhooks', '—', '✓', '✓'],
  ['High-volume API', '—', 'Contracted', 'Custom'],
  ['Custom schemas and delivery', '—', '—', '✓'],
  ['Dedicated environment', '—', 'Optional', '✓'],
]

export default function PricingPage() {
  return (
    <div className="marketing-shell">
      <section className="marketing-hero">
        <p className="section-label">PRODUCT HIERARCHY</p>
        <h1 className="marketing-title">Understand XRPL. Operate intelligence. Build infrastructure.</h1>
        <p className="marketing-copy">Choose the layer that matches your operating model. Pricing and capacity are presented truthfully; contracted capabilities require technical and commercial review.</p>
        <div className="cta-row"><Link href="/enterprise" className="btn-primary">Talk to Institutional Sales</Link><Link href="/strategic-infrastructure" className="btn-secondary">Build With NOSHASHI</Link></div>
      </section>
      <section className="tier-grid">
        <article className="pricing-card pricing-card-basic"><div className="pricing-eyebrow">FREE</div><h2>XRPL discovery</h2><div className="pricing-price">$0</div><p>For researchers, individuals, and ecosystem participants exploring basic intelligence.</p><div className="pricing-feature-list"><div>✓ Basic intelligence</div><div>✓ Limited analysis</div><div>✓ Limited API access</div></div><Link href="/assets" className="btn-secondary">Explore Platform</Link></article>
        <article className="pricing-card pricing-card-pro"><div className="pricing-eyebrow">PRO</div><h2>Professional XRPL intelligence</h2><div className="pricing-price">$749 <span>/ month</span></div><p>For professional analysts, traders, researchers, and smaller organizations.</p><div className="pricing-feature-list"><div>✓ Advanced asset intelligence</div><div>✓ Liquidity and historical analysis</div><div>✓ Alerts, reports, and research tools</div></div><Link href="/research" className="btn-secondary">Explore Pro Workflow</Link></article>
        <EnterprisePricingCard />
        <StrategicPricingCard />
      </section>
      <section className="panel comparison-panel"><div className="panel-header"><div><p className="section-label">CAPABILITY MATRIX</p><h2>Truthful product boundaries</h2></div></div><div className="comparison-table"><div className="comparison-row comparison-header"><span>Capability</span><span>PRO</span><span>ENTERPRISE</span><span>STRATEGIC</span></div>{comparison.map((row) => <div className="comparison-row" key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div></section>
    </div>
  )
}
