import Link from 'next/link'

const strategicFeatures = [
  'Everything in Enterprise',
  'High-volume APIs and contracted capacity',
  'XRPL event feeds, webhooks, and custom schemas',
  'Custom data delivery and integration framework',
  'Dedicated environment options where supported',
  'Embedded or white-label delivery when contracted',
  'Architecture review and strategic engineering support',
]

export default function StrategicPricingCard() {
  return (
    <article className="pricing-card pricing-card-strategic">
      <div className="pricing-eyebrow">STRATEGIC INFRASTRUCTURE</div>
      <h2>Institutional XRPL Data &amp; Intelligence Infrastructure</h2>
      <div className="pricing-price">$20,850 <span>/ month</span></div>
      <div className="pricing-annual">$250,000 / year · contract-based infrastructure</div>
      <p>Build your institutional XRPL intelligence layer with NOSHASHI through APIs, events, data delivery, and integration support.</p>
      <div className="pricing-feature-list">
        {strategicFeatures.map((feature) => <div key={feature}>✓ {feature}</div>)}
      </div>
      <div className="pricing-actions">
        <Link href="/strategic-infrastructure" className="btn-primary">Build With NOSHASHI</Link>
        <Link href="/strategic-infrastructure#architecture-review" className="btn-secondary">Request Architecture Review</Link>
      </div>
    </article>
  )
}
