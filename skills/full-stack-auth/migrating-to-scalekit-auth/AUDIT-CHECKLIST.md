# Auth Code Audit Checklist

## Flows to locate and document
- [ ] Sign-up endpoint and validation logic
- [ ] Login endpoint (password, OAuth, SSO paths)
- [ ] Session middleware (where tokens are validated per request)
- [ ] Refresh token handling
- [ ] RBAC enforcement points (middleware, decorators, guards)
- [ ] Email verification trigger and callback
- [ ] Logout + session invalidation

## Data to export
- [ ] Users table (email, name, email_verified, created_at)
- [ ] Organizations / tenants table
- [ ] Role definitions and user-role join table
- [ ] OAuth / SSO provider configs (client IDs, domains)

## Format for export
Produce a JSON array per entity type:

```json
[
  {
    "email": "user@example.com",
    "external_id": "usr_001",
    "first_name": "Jane",
    "last_name": "Doe",
    "email_verified": true,
    "org_external_id": "org_123",
    "roles": ["admin"]
  }
]
```
