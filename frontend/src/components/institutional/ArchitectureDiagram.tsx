const layers = [
  'XRPL Mainnet',
  'Validated ledger data',
  'Normalization and evidence store',
  'Calculations and policy engine',
  'Adjudication and monitoring',
  'NOSHASHI API / webhooks / event feeds',
  'Customer infrastructure',
]

export default function ArchitectureDiagram() {
  return (
    <div className="architecture-diagram" aria-label="NOSHASHI institutional data architecture">
      {layers.map((layer, index) => (
        <div key={layer} className="architecture-step">
          <span>{layer}</span>
          {index < layers.length - 1 && <b aria-hidden="true">↓</b>}
        </div>
      ))}
    </div>
  )
}
