import { LESSONS, LEVELS } from "@/lib/academy/academy";

/** Shared introduction for the browser and native learning app. */
export function AcademyIntro({ continuing }: { continuing: boolean }) {
  return (
    <section className="academy-intro" aria-labelledby="academy-intro-title">
      <div className="academy-intro-copy">
        <p className="academy-eyebrow">The learning desk / XRP Ledger</p>
        <h2 id="academy-intro-title">Learn the ledger.<br /><em>Read the evidence.</em></h2>
        <p className="academy-intro-lead">
          Understand issuer controls, delivered payments and funded order-book depth.
          Then put what you learn to work in the NOSHASHI lab workstation.
        </p>
        <a className="academy-intro-link" href="#academy-course">
          {continuing ? "Continue your course" : "Make the course your own"}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 3 10 10M3 13h10V3" stroke="currentColor" strokeWidth="1.2" /></svg>
        </a>
      </div>
      <aside className="academy-fieldnotes" aria-label="What you will learn to examine">
        <p className="academy-eyebrow">Field notes / three questions</p>
        <ol>
          <li><span>01</span><div><h3>Who holds the controls?</h3><p>Read an issuer’s on-ledger permissions.</p></div></li>
          <li><span>02</span><div><h3>What was delivered?</h3><p>Follow a payment’s actual delivered amount.</p></div></li>
          <li><span>03</span><div><h3>What depth is funded?</h3><p>Separate quoted offers from funded depth.</p></div></li>
        </ol>
        <p className="academy-fieldnotes-foot">Public evidence. Clear limits. Better questions.</p>
      </aside>
      <dl className="academy-course-facts">
        <div><dt>Short lessons</dt><dd>{LESSONS.length}</dd></div>
        <div><dt>Learning levels</dt><dd>{LEVELS.length}</dd></div>
        <div><dt>Study at your pace</dt><dd>~{LESSONS.reduce((n, l) => n + l.minutes, 0)} <small>min</small></dd></div>
        <div><dt>Your learning record</dt><dd className="academy-fact-label">Saved locally</dd></div>
      </dl>
    </section>
  );
}
