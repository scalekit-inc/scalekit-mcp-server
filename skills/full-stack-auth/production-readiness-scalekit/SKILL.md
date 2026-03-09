---
name: production-readiness-scalekit
description: Walks through a structured production readiness checklist for Scalekit authentication implementations. Use when the user says they are going live, launching to production, doing a pre-launch review, hardening their auth setup, or wants to verify their Scalekit implementation is production-ready.
---

# Scalekit Production Readiness

Work through each section in order — earlier sections are blockers for later ones. Skip sections that don't apply to this implementation.

---

## Quick checks (run first)

- [ ] Production environment URL, client ID, and client secret are set (not dev/staging values)
- [ ] HTTPS enforced on all auth endpoints
- [ ] CORS restricted to your domains only
- [ ] API credentials stored in environment variables — never committed to code
- [ ] Only enabled auth methods are active in production

---

## Customization

- [ ] Login page branded with logo, colors, styling
- [ ] Email templates customized (sign-up, password reset, invitations)
- [ ] Custom domain configured for auth pages (if applicable)
- [ ] Email provider configured in **Dashboard > Customization > Emails**
- [ ] Email deliverability tested — check spam folders
- [ ] Webhooks configured with signature validation

---

## Core auth flows

- [ ] Test login initiation with authorization URL
- [ ] Validate redirect URLs match dashboard configuration exactly
- [ ] Test authentication completion and code exchange
- [ ] Validate `state` parameter in callbacks (CSRF protection)
- [ ] Verify session token storage uses `httpOnly`, `secure`, and `sameSite` flags
- [ ] Configure token lifetimes for your security requirements
- [ ] Test session timeout and automatic token refresh
- [ ] Verify logout clears sessions completely

**Test each enabled auth method:**
- [ ] Email/password: sign-up, login, password reset
- [ ] Magic links: initiation, delivery, redemption, expiry
- [ ] Social logins: each configured provider (Google, Microsoft, GitHub, etc.)
  → Provider setup guides: https://docs.scalekit.com/guides/integrations/social-connections/
- [ ] Passkeys: registration, authentication, fallback
- [ ] Auth method selection UI renders correctly
- [ ] Fallback scenarios when an auth method fails

**Error handling:**
- [ ] Expired tokens handled gracefully
- [ ] Invalid authorization codes rejected
- [ ] Network failures show user-friendly messages
- [ ] Complete end-to-end flow validated in staging before production

---

## Enterprise auth (if enterprise customers at launch)

**SSO:**
- [ ] Test SSO with target IdPs: Okta, Azure AD, Google Workspace
  → IT admin setup guides per IdP: https://docs.scalekit.com/guides/integrations/sso-integrations/
- [ ] Configure user attribute mapping (email, name, groups)
- [ ] Test both SP-initiated and IdP-initiated SSO flows
- [ ] Verify SSO error handling for misconfigured connections
- [ ] Test SSO with: new users, existing users, deactivated users

**JIT provisioning:**
- [ ] Register all organization domains for JIT provisioning
- [ ] Configure consistent user identifiers across SSO connections (email or userPrincipalName)
- [ ] Set default roles for JIT-provisioned users
- [ ] Enable "Sync user attributes during login"
- [ ] Plan manual invitation process for contractors/external users with non-matching domains

**SCIM provisioning:**
- [ ] Configure webhook endpoints to receive SCIM events
  → IT admin setup guides per IdP: https://docs.scalekit.com/guides/integrations/scim-integrations/
- [ ] Verify webhook security with signature validation
- [ ] Test user provisioning (automatic creation)
- [ ] Test user deprovisioning (deactivation/deletion)
- [ ] Test user profile updates and role changes
- [ ] Set up group-based role assignment and sync
- [ ] Test error cases: duplicate users, invalid data

**Admin portal:**
- [ ] Configure admin portal access for enterprise customers
- [ ] Test admin portal SSO configuration flows
- [ ] Verify user management features in admin portal

**Network/firewall — enterprise customers behind VPN must whitelist:**

| Domain | Purpose |
|---|---|
| `<your-env>.scalekit.com` | Auth + admin portal |
| `cdn.scalekit.com` | Static assets |
| `fonts.googleapis.com` | Font resources |

- [ ] Customer firewalls allow Scalekit domains
- [ ] SSO tested from customer's network environment

---

## User and organization management (if implemented)

**User flows:**
- [ ] Configure profile fields collected at sign-up
- [ ] Test invitation flow and email templates
- [ ] Test user deletion flow

**Organization flows:**
- [ ] Test organization creation
- [ ] Test adding and removing users from organizations
- [ ] Set allowed email domains for org sign-ups (if applicable)
- [ ] Verify organization switching for users in multiple orgs
- [ ] Test organization deletion flow

**RBAC (if implemented):**
- [ ] Define and create roles and permissions
- [ ] Set default roles for new users
- [ ] Test role assignment to users and org members
- [ ] Verify permission checks in application code
- [ ] Test access control across all role levels
- [ ] Validate permission enforcement at API endpoints

---

## MCP authentication (if implemented)

- [ ] Test MCP server authentication flow
- [ ] Verify OAuth consent screen for MCP clients
- [ ] Test token exchange for MCP connections
- [ ] Verify custom auth handlers (if using)
- [ ] Test MCP session management

---

## Monitoring and incident readiness

**Observability:**
- [ ] Auth logs monitoring configured in **Dashboard > Auth Logs**
- [ ] Alerts set for suspicious activity (multiple failed logins, unusual locations)
- [ ] Webhook event monitoring and logging active
- [ ] Error tracking configured for authentication failures

**Key metrics to track from day one:**
- Sign-up rate and conversion
- Login success/failure rates
- Session creation and duration
- Token refresh frequency
- Webhook delivery success rate

**Reliability:**
- [ ] Log retention policies configured
- [ ] Webhook delivery and retry mechanism tested
- [ ] Incident response runbook written (who to contact, how to roll back, escalation path)
- [ ] Rollback plan ready (feature flag to disable new auth flows if needed)
