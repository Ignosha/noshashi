import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy - Ignoshashi',
  description: 'Privacy policy for Ignoshashi platform.',
}

export default function PrivacyPage() {
  return (
    <div className="grid-bg">
      <div className="max-w-[880px] mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-[var(--label-3)] text-sm">Last updated: August 2026</p>
        </div>

        <div className="prose space-y-6 text-[var(--label-2)]">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us, such as when you create an account, 
              connect a broker, or contact us for support. This may include your name, email address, 
              and broker API credentials (which are encrypted and not stored).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">2. How We Use Your Information</h2>
            <p>
              We use the information we collect to provide, maintain, and improve our services, 
              process transactions, send you technical notices and support messages, and respond 
              to your comments and questions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">3. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your 
              personal information. Broker API credentials are encrypted in transit and at rest. 
              We do not store your raw API keys or trading passwords.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">4. Data Sharing</h2>
            <p>
              We do not sell, trade, or otherwise transfer your personal information to third 
              parties except as described in this policy. We may share your information with 
              service providers who assist us in operating the Platform, conducting our business, 
              or servicing you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">5. Cookies and Tracking</h2>
            <p>
              We use cookies and similar tracking technologies to track activity on our Platform 
              and hold certain information. You can instruct your browser to refuse all cookies 
              or to indicate when a cookie is being sent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">6. Data Retention</h2>
            <p>
              We retain your personal information only for as long as necessary to provide you 
              with our services and as described in this Privacy Policy. You may request deletion 
              of your account and associated data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">7. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have rights regarding your personal data, 
              including the right to access, correct, delete, or port your data. To exercise these 
              rights, please contact us at privacy@ignoshashi.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">8. Children&apos;s Privacy</h2>
            <p>
              Our Platform is not intended for children under the age of 18. We do not knowingly 
              collect personal information from children under 18. If you are a parent or guardian 
              and believe your child has provided us with personal information, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">9. Changes to This Policy</h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes 
              by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-3">10. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at 
              privacy@ignoshashi.com.
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
