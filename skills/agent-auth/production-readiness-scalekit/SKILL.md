---
name: production-readiness-scalekit
description: Walks through a structured production readiness checklist for Scalekit agent authentication implementations. Use when the user says they are going live, launching to production, doing a pre-launch review, or wants to verify their agent OAuth implementation is production-ready.
---

# Scalekit Agent Auth Production Readiness

Work through each section in order — earlier sections are blockers for later ones.

---

## Quick checks (run first)

- [ ] Production environment URL, client ID, and client secret are set (not dev/staging values)
- [ ] HTTPS enforced on all auth endpoints
- [ ] API credentials stored in environment variables — never committed to code
- [ ] Redirect URIs registered in dashboard match exactly what the app sends

---

## OAuth token flows

- [ ] Test authorization URL generation with correct scopes
- [ ] Validate `state` parameter in callbacks (CSRF protection)
- [ ] Test authorization code exchange for access + refresh tokens
- [ ] Verify access tokens are stored securely (not in localStorage or logs)
- [ ] Test automatic token refresh before expiry
- [ ] Verify token refresh handles concurrent requests correctly (no race conditions)
- [ ] Test behavior when refresh token expires — user prompted to re-authorize
- [ ] Verify revocation on logout clears stored tokens

**Per connected service:**
- [ ] Test OAuth flow end-to-end for each service (Gmail, Slack, Notion, etc.)
- [ ] Verify correct scopes requested — request minimum required
- [ ] Test API calls with valid access token succeed
- [ ] Test API calls with expired token trigger refresh correctly
- [ ] Test behavior on permission denied (user revoked access in the third-party app)

---

## Security

- [ ] Access tokens never logged or exposed in error messages
- [ ] Refresh tokens stored encrypted at rest
- [ ] Token storage scoped per user — no cross-user token access possible
- [ ] Webhook/callback endpoint validates signatures (if applicable)

---

## Monitoring and incident readiness

- [ ] Auth logs monitoring configured in **Dashboard > Auth Logs**
- [ ] Error tracking configured for OAuth failures and token refresh errors
- [ ] Alerts configured for repeated authorization failures
- [ ] Log retention policies configured
- [ ] Incident response runbook written (who to contact, how to revoke compromised tokens)

**Key metrics:**
- Token refresh success/failure rate
- OAuth authorization completion rate (initiated vs completed)
- Per-service API error rates (distinguish auth errors from service errors)
- Token expiry distribution (are tokens being refreshed proactively?)
