# Data Processing Addendum

*Template. Not legal advice. Review by qualified counsel before use.*

This Data Processing Addendum (**DPA**) forms part of the Master
Subscription Agreement (**MSA**) between NOSHASHI Labs (**Processor**)
and [●] (**Customer**, the **Controller**). It applies where NOSHASHI
processes Personal Data on Customer's behalf in providing the Service.

## 1. Definitions

- **Data Protection Law:** the laws that apply to the processing,
  including, where applicable:
  - the EU GDPR (Regulation 2016/679)
  - the UK GDPR and Data Protection Act 2018
  - the Swiss FADP
  - the California Consumer Privacy Act as amended (CCPA)
- **Personal Data**, **Processing**, **Controller**, **Processor**,
  **Data Subject** and **Personal Data Breach** have the meanings given
  in the GDPR.
- **Subprocessor:** a third party NOSHASHI engages to process Personal
  Data for the Service.

## 2. Roles and instructions

2.1 Customer is the Controller, and NOSHASHI the Processor, of the
Personal Data described in Annex 1.

2.2 NOSHASHI processes Personal Data only on Customer's documented
instructions. The MSA, this DPA and Customer's use of the Service's
features are those instructions. If NOSHASHI believes an instruction
breaks Data Protection Law, it will tell Customer.

2.3 For account data it needs to run its business (billing, account
security, legal obligations), NOSHASHI acts as an independent
controller under its published Privacy Policy.

2.4 **CCPA.** NOSHASHI is a "service provider". It will not sell or
share Personal Data, or retain, use or disclose it outside the direct
business relationship with Customer.

## 3. NOSHASHI's obligations

3.1 **Confidentiality.** People authorized to process Personal Data
are bound by confidentiality.

3.2 **Security.** NOSHASHI implements the measures in Annex 2.

3.3 **Assistance.** NOSHASHI will reasonably assist Customer with:
- Data Subject requests
- data protection impact assessments
- consultations with supervisory authorities

It will do so taking into account the nature of the processing and the
information available to it.

3.4 **Personal Data Breach.** NOSHASHI will notify Customer without
undue delay, and in any case within seventy-two (72) hours, after
becoming aware of a Personal Data Breach affecting Customer's Personal
Data. The notice will describe the nature of the breach, the data and
Data Subjects concerned, likely consequences and measures taken. More
detail follows as it becomes available.

3.5 **Deletion or return.** At the end of the Service, NOSHASHI deletes
or returns Personal Data as set out in MSA §5.5.

3.6 **Records and audits.** NOSHASHI will make available the
information reasonably needed to demonstrate compliance with this DPA.
This includes its security documentation and, once held, third-party
audit reports.

Customer may audit no more than once a year, with thirty (30) days'
notice, during business hours, at its own cost, and under
confidentiality. Customer will first rely on NOSHASHI's documentation
and third-party reports where they answer its questions.

## 4. Subprocessors

4.1 Customer authorizes the Subprocessors listed in Annex 3.

4.2 NOSHASHI will give at least thirty (30) days' notice of a new
Subprocessor, by email and by updating its published list. If Customer
objects on reasonable data-protection grounds, the parties will
discuss it in good faith. If they can't resolve it, Customer may
terminate the affected Service and receive a refund of prepaid fees for
the remaining term.

4.3 NOSHASHI imposes data-protection terms on each Subprocessor that
are no less protective than this DPA, and remains responsible for their
performance.

## 5. International transfers

Personal Data is hosted in the United States. Where Personal Data from
the EEA, UK or Switzerland is transferred to NOSHASHI, the parties
enter into:

- the EU Standard Contractual Clauses (Commission Decision 2021/914),
  Module Two (controller to processor), with the options in Annex 4
- for the UK, the International Data Transfer Addendum
- for Switzerland, the Clauses as adapted for the FADP

[Drafting note: attach the executed clauses.]

## 6. Liability

Liability under this DPA is subject to the limits in the MSA, except
where Data Protection Law does not allow such limits.

---

## Annex 1: Description of processing

| Item | Detail |
|---|---|
| Subject matter | Providing the NOSHASHI hosted Service to Customer |
| Duration | The term of the MSA, plus the deletion period in MSA §5.5 |
| Nature and purpose | Storage and processing to provide organization features: shared policies, exceptions, investigations, audit log, the Compliance API, webhooks and event feeds |
| Data Subjects | Customer's Users; people Customer records in investigation notes or exceptions (for example its own clients) |
| Personal Data | Users: name, email address, organization role, sign-in records (time, IP address, client identifier, whether a second factor was used), audit-log actions. Content Customer enters: free text in notes and exceptions, and XRPL addresses Customer associates with its clients |
| Special categories | None intended. Customer will not enter special-category data |
| Frequency | Continuous |

## Annex 2: Technical and organizational measures

Every item describes the Service as it runs today; see
`docs/SECURITY_ASSESSMENT_2026-09.md`.

1. **Access control in the database.** Row-level security on every
   table. Organization roles are enforced in the database, not only in
   the app. Four-eyes controls on policy activation and exception
   decisions.
2. **Encryption.** TLS for data in transit. Encryption at rest by the
   hosting provider. Backups encrypted (AES-256, GPG) before they leave
   the database.
3. **Accountability.** An append-only audit log of administrative
   actions and sign-ins; update and delete are refused for every role.
4. **Authentication.**
   - Email and password, with passwords screened against known breaches.
   - TOTP second factor.
   - API keys stored only as SHA-256 digests.
5. **Application security.**
   - Strict Content-Security-Policy on the website and the desktop app.
   - Signed updates.
   - Dependency audits.
   - An annual security assessment.
6. **Availability.** Nightly encrypted backups, with a monthly automated
   restore test.
7. **Incident response.** A written plan with breach notification
   within 72 hours.
8. **Data minimization.** The desktop app keeps analysis data on the
   user's device unless the user shares it into an organization. There
   is no analytics or advertising tracking.

## Annex 3: Subprocessors

| Subprocessor | Location | Purpose |
|---|---|---|
| Supabase, Inc. | United States | Database, authentication, server functions |
| Stripe, Inc. | United States | Payments and invoicing |
| Vercel, Inc. | United States | Website hosting and its functions, including the contact form |
| Resend | United States | Transactional email: contact messages, support notifications |

## Annex 4: Standard Contractual Clauses selections

[Drafting note, to be completed by counsel:
- Clause 7 (docking clause): [include]
- Clause 9: option 2 (general authorization), with the notice period
  in §4.2
- Clause 11: [optional redress clause omitted]
- Clause 17: governing law of [an EU member state]
- Clause 18: courts of [the same member state]
- Competent supervisory authority: [●]]
