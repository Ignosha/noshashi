import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Disclaimer - Ignoshashi',
  description: 'Legal disclaimer for Ignoshashi platform.',
}

export default function DisclaimerPage() {
  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">Disclaimer</h1>
          <p className="text-[var(--label-3)] text-sm">Last updated: August 2026</p>
        </div>

        <div className="prose space-y-6 text-[var(--label-2)]">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">1. Not Investment Advice</h2>
            <p>
              Ignoshashi is a research and analysis platform. We do not provide investment advice, 
              financial planning, or broker-dealer services. All content, signals, analysis, and data 
              provided through our platform are for informational and educational purposes only.
            </p>
            <p>
              You should not construe any information on this platform as a recommendation to buy, 
              sell, or hold any security or other financial product. We are not a registered investment 
              adviser, broker-dealer, or financial planner.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">2. No Guarantee of Results</h2>
            <p>
              Past performance is not indicative of future results. Any historical performance data 
              referenced on this platform is provided for illustrative purposes only and should not 
              be construed as a guarantee of future performance.
            </p>
            <p>
              Trading in securities involves substantial risk of loss. You may lose some or all of 
              your invested capital. Signals and strategies may result in losses, even if they have 
              performed well historically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">3. Data Accuracy</h2>
            <p>
              While we strive to provide accurate and timely data, we cannot guarantee the accuracy, 
              completeness, or timeliness of any data, signals, or analysis provided. Market data 
              may be delayed, and third-party data sources may contain errors or omissions.
            </p>
            <p>
              We rely on third-party data providers (including but not limited to Polygon.io, Alpaca, 
              and social media APIs) for market data and social sentiment analysis. We are not 
              responsible for errors or delays in data provided by these third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">4. Risk Disclosure</h2>
            <p>
              Trading stocks, options, and other securities involves significant risk and is not 
              suitable for every investor. You should carefully consider your financial situation, 
              investment objectives, and risk tolerance before making any investment decisions.
            </p>
            <p>
              Leveraged and inverse ETFs, options, futures, and other complex financial instruments 
              carry additional risks and are not suitable for all investors. You could lose more 
              than your initial investment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">5. Regulatory Compliance</h2>
            <p>
              You are solely responsible for ensuring that your use of our platform complies with 
              all applicable laws, rules, and regulations in your jurisdiction, including but not 
              limited to securities laws, tax laws, and anti-money laundering regulations.
            </p>
            <p>
              Ignoshashi does not facilitate trades, hold client funds, or act as a custodian. 
              Any trades you execute are through third-party brokers with whom you have a direct 
              relationship.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Ignoshashi, its founders, employees, and 
              affiliates shall not be liable for any direct, indirect, incidental, special, 
              consequential, or punitive damages arising from your use of or inability to use 
              the platform, including but not limited to trading losses, lost profits, or lost data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">7. Contact</h2>
            <p>
              If you have questions about this disclaimer, please contact us at 
              <Link href="/legal/tos" className="text-[var(--accent)] hover:text-[var(--text)] transition-colors ml-1">
                Terms of Service
              </Link>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[var(--line)]">
          <Link 
            href="/"
            className="text-[var(--accent)] hover:text-[var(--text)] transition-colors text-sm"
          >
            ← Back to Ignoshashi
          </Link>
        </div>
      </div>
    </div>
  )
}
