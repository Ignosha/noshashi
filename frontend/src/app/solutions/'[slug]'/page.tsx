import Link from 'next/link'

export function generateStaticParams() {
  return ['banks', 'custodians', 'exchanges', 'compliance', 'risk', 'trading', 'issuers'].map((slug) => ({ slug }))
}

export default function SolutionPage({ params }: { params: { slug: string } }) {
  const title = params.slug.charAt(0).toUpperCase() + params.slug.slice(1)
  return <div className="marketing-shell"><section className="marketing-hero"><p className="section-label">SOLUTIONS · {title.toUpperCase()}</p><h1 className="marketing-title">Evidence-backed XRPL intelligence for {title.toLowerCase()} teams.</h1><p className="marketing-copy">Investigate assets, controls, liquidity, counterparties, and policy outcomes through a workflow built for institutional review. This page describes the solution path; availability depends on configured data sources and contract scope.</p><div className="cta-row"><Link href="/enterprise" className="btn-primary">Explore Enterprise</Link><Link href="/pricing" className="btn-secondary">View Pricing</Link></div></section><section className="passport-grid"><div className="passport-card"><div className="passport-kicker">PROBLEM</div><ul><li>Fragmented XRPL observations</li><li>Unclear evidence and policy context</li></ul></div><div className="passport-card"><div className="passport-kicker">WORKFLOW</div><ul><li>Collect evidence</li><li>Calculate and evaluate policy</li><li>Review adjudication</li></ul></div><div className="passport-card"><div className="passport-kicker">OUTPUT</div><ul><li>Decision context</li><li>Historical changes</li><li>Audit-ready evidence</li></ul></div></section></div>
}
