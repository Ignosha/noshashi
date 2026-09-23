import Link from 'next/link'

const enterpriseFeatures = [
  'Asset Passport and issuer intelligence',
  'Counterparty and liquidity intelligence',
  'Historical analysis and policy engine',
  'Adjudication, evidence, and audit trail',
  'Monitoring for control, liquidity, and policy changes',
  'Institutional API, webhooks, organization access, and RBAC',
]

export default function EnterprisePricingCard() {
  return (
    <article className="pricing-card pricing-card-enterprise">
      <div className="pricing-eyebrow">ENTERPRISE</div>
      <h2>Institutional XRPL Intelligence</h2>
      <div className="pricing-price">$10,000 <span>/ month</span></div>
      <div className="pricing-annual">$120,000 / year · annual contract</div>
      <p>Operate institutional XRPL intelligence across risk, compliance, trading, and digital-asset infrastructure teams.</p>
      <div className="pricing-feature-list">
        {enterpriseFeatures.map((feature) => <div key={feature}>✓ {feature}</div>)}
      </div>
      <div className="pricing-actions">
        <Link href="/enterprise" className="btn-primary">Talk to Institutional Sales</Link>
        <Link href="/" className="btn-secondary">Explore Platform</Link>
      </div>
    </article>
  )
}
