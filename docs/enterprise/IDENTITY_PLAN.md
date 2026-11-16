# Enterprise identity — OIDC-first plan

Status: **MISSING / BLOCKED pending buyer requirements and identity-owner approval**. Keep existing Supabase password/OTP/MFA authentication unchanged. No IdP, callback, account-linking or role-mapping configuration is changed by this work.

Use the existing Auth provider as the session authority. Evaluate its supported organization/SSO options and plan limitations against actual customers before choosing an adapter. Do not build a second parallel session/entitlement system.

Required design controls: per-organization issuer/client configuration; exact issuer/audience/signature/nonce validation; authorization-code flow with PKCE and state; discovery/JWKS fetched only from approved HTTPS IdP hosts with timeouts and bounded caching; explicit domain/organization onboarding; no silent email-only account linking; no elevation from untrusted token group claims; owner-approved allowlisted role mappings; membership removal and session revocation; mandatory-MFA policy where contracted; audited configuration changes; and a tested break-glass owner account held outside the normal federation path.

Test fixtures must cover wrong issuer/audience, expired tokens, nonce/state replay, unknown signing keys, key rotation, cross-tenant identity claims, email collisions, mapping escalation, disabled users, outage recovery and break-glass use. End-to-end tests must use a dedicated non-production IdP and staging tenant. SAML should be evaluated only for a real buyer requirement; supporting OIDC does not establish SAML or SCIM support.

Owner: identity/security engineer. Next action: select an actual evaluation IdP with the founder, document provider/plan capabilities, and obtain approval for a staging-only integration. Verification: full sign-in → organization membership → role → privileged action → offboarding denial. Blockers: provider configuration, approved mapping policy, staging environment and break-glass ownership.
