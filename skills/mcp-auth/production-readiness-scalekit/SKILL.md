---
name: production-readiness-scalekit
description: Walks through a structured production readiness checklist for Scalekit MCP authentication implementations. Use when the user says they are going live, launching to production, doing a pre-launch review, or wants to verify their MCP server authentication is production-ready.
---

# Scalekit MCP Auth Production Readiness

Work through each section in order — earlier sections are blockers for later ones.

---

## Quick checks (run first)

- [ ] Production environment URL, client ID, and client secret are set (not dev/staging values)
- [ ] HTTPS enforced on all auth endpoints
- [ ] CORS restricted to your domains only
- [ ] API credentials stored in environment variables — never committed to code

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
- [ ] Expired tokens handled gracefully
- [ ] Network failures show user-friendly messages

---

## MCP authentication

- [ ] Test MCP server authentication flow end-to-end
- [ ] Verify OAuth consent screen displays correctly for MCP clients
- [ ] Test token exchange for MCP connections
- [ ] Verify resource metadata published at `/.well-known/oauth-protected-resource`
- [ ] Test MCP session management (session creation, expiry, refresh)
- [ ] Verify custom auth handlers behave correctly (if using)
- [ ] Test MCP client reconnection after token expiry
- [ ] Verify scopes are correctly enforced per MCP tool/resource

---

## Monitoring and incident readiness

- [ ] Auth logs monitoring configured in **Dashboard > Auth Logs**
- [ ] Alerts set for suspicious activity (repeated auth failures, unusual access patterns)
- [ ] Error tracking configured for authentication failures
- [ ] Log retention policies configured
- [ ] Incident response runbook written (who to contact, how to roll back)
- [ ] Rollback plan ready (disable MCP auth without breaking existing sessions)

**Key metrics:**
- MCP auth success/failure rates
- Token exchange latency
- Session creation and duration
- Token refresh frequency
