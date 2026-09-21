import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service - Ignoshashi',
  description: 'Terms of service for Ignoshashi platform.',
}

export default function TermsPage() {
  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-[var(--label-3)] text-sm">Last updated: August 2026</p>
        </div>

        <div className="prose space-y-6 text-[var(--label-2)]">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Ignoshashi (&quot;the Platform&quot;), you agree to be bound by these 
              Terms of Service. If you do not agree to these terms, please do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">2. Description of Service</h2>
            <p>
              Ignoshashi provides AI-powered market research tools, signal generation, portfolio 
              tracking, and strategy backtesting. The Platform does not execute trades, hold 
              client funds, or provide investment advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">3. User Responsibilities</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials 
              and for all activities that occur under your account. You agree to notify us 
              immediately of any unauthorized use of your account.
            </p>
            <p>
              You agree to use the Platform only for lawful purposes and in accordance with these 
              Terms. You are solely responsible for your investment decisions and any trades you 
              execute through third-party brokers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">4. Subscription and Payments</h2>
            <p>
              Certain features of the Platform require a paid subscription. Subscription fees are 
              billed in advance on a monthly or annual basis. All fees are non-refundable except 
              as required by law.
            </p>
            <p>
              We reserve the right to change our pricing at any time. We will provide reasonable 
              notice of any price changes before they take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">5. Intellectual Property</h2>
            <p>
              The Platform and its original content, features, and functionality are owned by 
              Ignoshashi and are protected by international copyright, trademark, patent, trade 
              secret, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">6. Termination</h2>
            <p>
              We may terminate or suspend your account and access to the Platform immediately, 
              without prior notice or liability, for any reason, including but not limited to 
              your breach of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">7. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the 
              jurisdiction in which Ignoshashi operates, without regard to its conflict of law 
              provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">8. Contact Information</h2>
            <p>
              For questions about these Terms, please contact us at legal@ignoshashi.com.
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
