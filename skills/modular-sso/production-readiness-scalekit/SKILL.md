---
name: production-readiness-scalekit
description: Walks through a structured production readiness checklist for Scalekit SSO implementations. Use when the user says they are going live, launching to production, doing a pre-launch review, hardening their SSO setup, or wants to verify their Scalekit implementation is production-ready.
---

# Scalekit SSO Production Readiness

Work through each section in order — earlier sections are blockers for later ones.

---

## Quick checks (run first)

- [ ] Production environment URL, client ID, and client secret are set (not dev/staging values)
- [ ] HTTPS enforced on all auth endpoints
- [ ] CORS restricted to your domains only
- [ ] API credentials stored in environment variables — never committed to code

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
- [ ] Test session timeout and automatic token refresh
- [ ] Verify logout clears sessions completely
- [ ] Expired tokens handled gracefully
- [ ] Network failures show user-friendly messages

---

## SSO flows

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
- [ ] Set up review process for automatically provisioned users

**Admin portal:**
- [ ] Configure admin portal access for enterprise customers
- [ ] Test admin portal SSO configuration flows
- [ ] Verify user management features in admin portal

---

## Organization management

- [ ] Test organization creation
- [ ] Test adding and removing users from organizations
- [ ] Set allowed email domains for org sign-ups (if applicable)
- [ ] Verify organization switching for users in multiple orgs
- [ ] Test invitation flow and email templates

---

## Network and firewall

Enterprise customers behind VPN or corporate firewall must whitelist:

| Domain | Purpose |
|---|---|
| `<your-env>.scalekit.com` | Auth + admin portal |
| `cdn.scalekit.com` | Static assets |
| `fonts.googleapis.com` | Font resources |

- [ ] Customer firewalls allow Scalekit domains
- [ ] SSO tested from customer's network environment

---

## Monitoring and incident readiness

- [ ] Auth logs monitoring configured in **Dashboard > Auth Logs**
- [ ] Alerts set for suspicious activity (multiple failed logins, unusual locations)
- [ ] Webhook event monitoring and logging active
- [ ] Error tracking configured for authentication failures
- [ ] Log retention policies configured
- [ ] Webhook delivery and retry mechanism tested
- [ ] Incident response runbook written (who to contact, how to roll back, escalation path)
- [ ] Rollback plan ready (feature flag to disable SSO flows if needed)

**Key metrics:**
- Login success/failure rates
- SSO initiation vs completion rate
- Session creation and duration
- Webhook delivery success rate
