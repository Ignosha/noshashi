import Link from 'next/link'
import ArchitectureDiagram from '@/components/institutional/ArchitectureDiagram'

const sections = ['Institutional Asset Intelligence', 'Asset Passport', 'Liquidity Intelligence', 'Counterparty Intelligence', 'Policy Engine', 'Monitoring', 'Evidence & Audit', 'API Infrastructure', 'Security Architecture', 'Enterprise Workflow']

export default function EnterprisePage() {
  return <div className="marketing-shell">
    <section className="marketing-hero"><p className="section-label">NOSHASHI ENTERPRISE</p><h1 className="marketing-title">Institutional Intelligence for the XRP Ledger.</h1><p className="marketing-copy">NOSHASHI transforms XRPL ledger data into evidence-backed institutional intelligence, deterministic policy analysis, monitoring, and programmable infrastructure.</p><div className="cta-row"><Link href="#sales" className="btn-primary">Talk to Institutional Sales</Link><Link href="/" className="btn-secondary">View Platform</Link></div></section>
    <section className="page-grid"><div className="panel span-2"><div className="panel-header"><div><p className="section-label">CONSOLE LAYER</p><h2>Operate with evidence, not opaque opinions.</h2></div></div><div className="passport-grid">{sections.map((section) => <div className="passport-card" key={section}><div className="passport-kicker">ENTERPRISE</div><ul><li>{section}</li><li>Evidence-backed workflow</li></ul></div>)}</div></div><div className="panel"><p className="section-label">DECISION PIPELINE</p><h2>Collect → Calculate → Evaluate → Adjudicate</h2><p className="hero-copy">The deterministic policy result remains the source of truth. Interpretation is separated from observation, calculation, policy, and decision.</p></div></section>
    <section className="panel"><div className="panel-header"><div><p className="section-label">INSTITUTIONAL WORKFLOW</p><h2>From ledger observation to reviewable decision.</h2></div></div><ArchitectureDiagram /></section>
    <section className="panel" id="sales"><p className="section-label">INSTITUTIONAL SALES</p><h2>Talk to the team about your XRPL operating model.</h2><p className="hero-copy">Sales conversations can cover company, role, XRPL exposure, use case, approximate volume, current tooling, and required integrations. No credentials or unnecessary sensitive information are required.</p><Link href="mailto:sales@noshashi.app" className="btn-primary">Contact Institutional Sales</Link></section>
  </div>
}
