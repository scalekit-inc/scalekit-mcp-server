---
name: production-readiness-scalekit
description: Walks through a structured production readiness checklist for Scalekit SCIM provisioning implementations. Use when the user says they are going live, launching to production, doing a pre-launch review, or wants to verify their SCIM directory sync implementation is production-ready.
---

# Scalekit SCIM Production Readiness

Work through each section in order — earlier sections are blockers for later ones.

---

## Quick checks (run first)

- [ ] Production environment URL, client ID, and client secret are set (not dev/staging values)
- [ ] HTTPS enforced on all endpoints
- [ ] API credentials stored in environment variables — never committed to code
- [ ] Webhook secret stored in environment variables — never committed to code

---

## SCIM provisioning

- [ ] Configure webhook endpoints to receive SCIM events
  → IT admin setup guides per IdP: https://docs.scalekit.com/guides/integrations/scim-integrations/
- [ ] Verify webhook security with signature validation on every request
- [ ] Test user provisioning (automatic creation from IdP)
- [ ] Test user deprovisioning (deactivation/deletion when removed in IdP)
- [ ] Test user profile updates (name, email, attributes synced correctly)
- [ ] Test role changes propagated via group membership
- [ ] Set up group-based role assignment and sync
- [ ] Test error cases: duplicate users, invalid data, missing required fields
- [ ] Verify idempotent handling — duplicate events must not create duplicate records
- [ ] Deactivation preferred over hard deletion for `user_deleted` events

**Webhook reliability:**
- [ ] Webhook endpoint returns 2xx quickly — offload heavy processing to a queue if needed
- [ ] Scalekit retries on non-2xx with exponential backoff (up to 8 attempts over ~10 hours)
- [ ] Tested webhook delivery end-to-end with a real IdP or Scalekit's test tool

---

## User and organization management

- [ ] Test organization creation and domain assignment
- [ ] Test adding and removing users from organizations
- [ ] Set allowed email domains for org provisioning (if applicable)
- [ ] Set default roles for auto-provisioned users
- [ ] Test user deletion flow

**RBAC (if implemented):**
- [ ] Define roles and permissions that map to IdP groups
- [ ] Test role assignment via group membership sync
- [ ] Verify permission enforcement at API endpoints
- [ ] Test access control across all role levels

---

## Network and firewall

Enterprise customers behind VPN or corporate firewall must whitelist:

| Domain | Purpose |
|---|---|
| `<your-env>.scalekit.com` | Directory API + webhook delivery |
| `cdn.scalekit.com` | Static assets |

- [ ] Customer firewalls allow Scalekit domains
- [ ] SCIM provisioning tested from customer's network environment

---

## Monitoring and incident readiness

- [ ] Webhook event monitoring and logging active
- [ ] Error tracking configured for provisioning failures
- [ ] Alerts configured for failed webhook deliveries
- [ ] Log retention policies configured
- [ ] Webhook delivery and retry mechanism tested
- [ ] Incident response runbook written (who to contact, how to roll back)
- [ ] Rollback plan ready (disable SCIM sync without breaking existing users)

**Key metrics:**
- Webhook delivery success rate
- User provisioning/deprovisioning latency
- Failed sync events (by type and error)
- Group-to-role mapping accuracy
