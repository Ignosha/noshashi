# NOSHREPAIR

NOSHASHI's support console, a separate desktop app (Tauri) for support
staff. Every ticket opened in the NOSHASHI app, including the ones the
support assistant hands over with its conversation attached, arrives in
NOSHREPAIR's queue. From a ticket, staff can:

- read the conversation and reply;
- read the diagnostics the customer's app attached (version, platform and
  recent errors, scrubbed of keys, tokens and emails on the customer's machine);
- ask to look: the customer's NOSHASHI app asks them on whatever screen they
  are on, and they choose how long (4, 24 or 72 hours) and whether fixes may
  run without asking;
- see the customer's account, **read-only**, while the customer allows it;
- **look at the app** on one of the customer's computers: a read-only
  snapshot of its version, ledger server and latency, clock, sign-in, plan,
  settings health, updates and recent errors, with the problems in words;
- send a fix from a fixed list to **one computer** (or any of theirs). It
  runs when the customer presses **Apply**, or by itself if they allowed
  fixes when granting access. The list: full self-check, reconnect or switch
  ledger server, renew the sign-in, re-read the plan, repair damaged
  settings, clear the error log, check for or install the latest signed
  update, share diagnostics, show the getting-started guide, restart the
  window;
- spot the same error across tickets and file a GitHub issue for it, so the
  fix ships to every NOSHASHI app.

## Security model

The database is the boundary, not this app. A copy of NOSHREPAIR is worth
nothing without a support account, its authenticator, and a customer's grant.

| Rule | Where it is enforced |
|---|---|
| Only support staff, and only with two-factor (aal2), can read or act | `noshashi.is_repair_staff()` in every policy and function |
| An account is visible only while its owner's grant lasts (1 to 72 hours, revocable at once) | `support_account_view` checks `support_access_grants` |
| Read-only: staff have no write path to customer data | No table grants; only the functions below |
| No key material: API keys show name and prefix, never the hash | `support_account_view` |
| Repairs are ids from a fixed allowlist; no code, commands, paths or settings | Check constraint and `request_support_repair`; the app maps each id to a function it already has |
| Fixes run only after the customer's Apply, or by themselves while a grant that allows fixes is live; the snapshot (read-only) runs by itself under any live grant; staff cannot answer for the customer | `respond_support_repair` (owner only; `p_auto` checked against the grant) |
| A request sent to one computer runs on that computer only; support can only target computers the customer's app reported | `respond_support_repair` (`OTHER_DEVICE`), `request_support_repair` |
| Every request, view and repair is logged where the customer can read it; nobody can edit or delete the log | `support_access_log`, append-only |

On the app side: the session lives in memory for the app's lifetime only
(sessionStorage, separate from the NOSHASHI app's), sign-in pauses after 5
failed attempts, sessions end after 15 minutes idle, the window can only show
NOSHREPAIR's own pages, the CSP allows connections to NOSHASHI's Supabase
project only, and the single native command opens a new NOSHASHI GitHub
issue and nothing else.

`tests/sql/noshrepair.test.sql` plays each role against the migration and
runs in CI (`npm run test:sql <local postgres url>`).

## Adding an employee

1. The owner adds their work email to the invite list (Supabase SQL editor):

   ```sql
   insert into noshashi.support_staff_invites (email) values (lower('new.person@noshashi.app'));
   ```

2. The employee opens NOSHREPAIR, chooses **New employee? Set up your
   account**, and confirms the email from their inbox.
3. They sign in and scan the authenticator QR code (or type the key). Every
   later sign-in asks for a code.

An account that is not invited, or whose email is not confirmed, is signed
out with an explanation.

## Removing an employee

```sql
delete from noshashi.support_staff_invites where email = lower('person@noshashi.app');
delete from noshashi.support_staff s using auth.users u
  where u.id = s.account_id and lower(u.email) = lower('person@noshashi.app');
```

Their next request is refused. To end live sessions at once, also sign the
user out from Supabase → Authentication → Users.

## Running and building

```bash
npm run noshrepair:dev          # in a browser, http://localhost:1430
npm run noshrepair:tauri dev    # as the desktop app
npm run noshrepair:tauri build  # installers in noshrepair/src-tauri/target/release/bundle
```

Installers for macOS (one universal DMG for Intel and Apple silicon, macOS 10.15 or later), Windows and Linux are built by the
**NOSHREPAIR** workflow on every push that changes NOSHREPAIR, or by hand
(Actions → NOSHREPAIR → Run workflow), and attached to the run as
artifacts. They are unsigned: on macOS, right-click the app and choose
Open the first time; on Windows, choose More info → Run anyway.

## Before first use

The database side is `supabase/migrations/20261021120000_noshrepair.sql`
then `supabase/migrations/20261023120000_noshrepair_devices.sql`, applied
in that order before a NOSHASHI app with this code is released. The owner
applies each once: Supabase → SQL Editor → New query, paste the whole
file, Run. It only adds tables and functions. Until then the NOSHASHI
app hides its access panel and NOSHREPAIR's sign-in reports the account is
not on the support team.

## Accessibility

Built to WCAG 2.1 AA: labelled fields with linked hints and errors, errors
announced as they appear, focus moved to each screen's heading, a skip link,
visible focus, status in words as well as colour, rem sizing for zoom, the
system's light/dark and reduced-motion settings, and a warning with "Stay
signed in" before the idle sign-out (2.2.1).
