import { REPAIR_ACTIONS } from "@/lib/support/repairCatalog";
import { PageTitle, Section } from "../ui";

/** How NOSHREPAIR works, for a new employee, and what it deliberately cannot do. */
export function Help() {
  return (
    <div className="max-w-3xl space-y-4 text-sm leading-relaxed">
      <PageTitle eyebrow="FOR SUPPORT STAFF">How NOSHREPAIR works</PageTitle>
      <Section title="EVERY TICKET ARRIVES HERE">
        <p>
          Tickets opened in the NOSHASHI app, and the ones the support assistant hands over (with its conversation attached), land in the Queue as soon as they are
          sent. Reply from the ticket; the customer sees the reply in their app.
        </p>
      </Section>
      <Section title="FIXING A PROBLEM">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Read the conversation and the diagnostics the customer's app attached.</li>
          <li>If you need to see the account, ask for access. The customer chooses 4, 24 or 72 hours.</li>
          <li>With access, view the account (read-only) and send a repair from the list below.</li>
          <li>The customer presses Apply in their app; the result comes back to the ticket.</li>
          <li>If the same error shows up on many tickets, file a GitHub issue from Recurring errors so the fix ships to every app.</li>
        </ol>
      </Section>
      <Section title="THE REPAIRS YOU CAN SEND">
        <dl className="space-y-2">
          {REPAIR_ACTIONS.map((a) => (
            <div key={a.id}>
              <dt className="font-[600]">{a.title}</dt>
              <dd className="text-muted-foreground">{a.staff}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="WHAT NOSHREPAIR CANNOT DO, ON PURPOSE">
        <ul className="list-disc space-y-1 pl-5">
          <li>See any account the customer has not allowed, or after they revoke or the time runs out.</li>
          <li>Change an account, move funds, read wallet keys, seeds or API key values.</li>
          <li>Run code, commands or anything outside the list above on a customer's machine, or run a repair without the customer pressing Apply.</li>
          <li>Hide what it did: every request, view and repair is in an access log the customer can read and nobody can edit.</li>
          <li>Work without two-factor: the database refuses every NOSHREPAIR read and action unless your session passed your authenticator.</li>
        </ul>
      </Section>
      <Section title="YOUR SESSION">
        <ul className="list-disc space-y-1 pl-5">
          <li>You are signed out after 15 minutes without input, with a 2-minute warning and a button to stay signed in.</li>
          <li>Closing NOSHREPAIR signs you out. Nothing about a session or a ticket is saved on this computer.</li>
          <li>After 5 wrong passwords, sign-in pauses for a minute.</li>
          <li>Lost your authenticator, or leaving NOSHASHI? Tell the owner; they remove your access in one step.</li>
        </ul>
      </Section>
      <Section title="KEYBOARD AND SCREEN READERS">
        <p>
          Everything works from the keyboard: Tab moves between controls, and the first Tab on each screen offers "Skip to main content". Each screen announces its title,
          errors are read out as they appear, and the app follows your system's light or dark setting and text size.
        </p>
      </Section>
    </div>
  );
}
