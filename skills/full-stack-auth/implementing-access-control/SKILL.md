---
name: implementing-access-control
description: Implements server-side RBAC and permission checks by validating and decoding access tokens, extracting roles/permissions, and enforcing them with middleware/decorators at route boundaries. Use when building authorization around Scalekit tokens that embed roles and permissions.
---

# Implementing access control (Scalekit FSA)

## When to use
Use this Skill after authentication is working and the app must authorize access to routes/actions by inspecting the user's access token for `roles` and `permissions`.
Scalekit can embed these authorization details in the access token during the authentication flow, so the app can make decisions without extra API calls.
Always validate the token's integrity before trusting any embedded roles/permissions.

## Workflow
1. Validate the access token (expiry, issuer/audience as applicable) and then decode it to extract `sub`, `oid`, `roles`, and `permissions`.
2. Attach a normalized auth context to the request (ele: `req.user = { id, organizationId, roles, permissions }`) so downstream handlers can authorize consistently.
3. Enforce authorization at route boundaries using (a) role checks for broad access patterns and (b) permission checks for fine-grained actions (often `resource:action`).
4. Combine checks when needed (examples: "admin bypass", "resource ownership", time-based restrictions for sensitive operations).
5. Never rely on client-side authorization alone; enforce roles/permissions server-side.

## Reference implementation

### Node.js (Express-style middleware)

Validate+extract, then RBAC/PBAC guards.

```js
// validate + extract
const validateAndExtractAuth = async (req, res, next) => {
  try {
    const accessToken = decrypt(req.cookies.accessToken); // if encrypted
    const isValid = await scalekit.validateAccessToken(accessToken);
    if (!isValid) return res.status(401).json({ error: "Invalid or expired token" });

    const tokenData = await dessToken(accessToken); // JWT decode library
    req.user = {
      id: tokenData.sub,
      organizationId: tokenData.oid,
      roles: tokenData.roles || [],
      permissions: tokenData.permissions || []
    };
    next();
  } catch {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

// RBAC
const hasRole = (user, role) => user.roles?.includes(role);
const requireRole = (role) => (req, res, next) =>
  hasRole(req.user, role) ? next() : res.status(403).json({ error: `Access denied. Required role: ${role}` });

// PBAC
const hasPermission = (user, perm) => user.permissions?.includes(perm);
const requirePermission = (perm) => (req, res, next) =>
  hasPermission(req.user, perm) ? next() : res.status(403).json({ error: `Access denied. Required permission: ${perm}` });

// usage
app.get("/api/projects", validateAndExtractAuth, requirePermission("projects:read"), handler);
app.get("/api/admin/users", validateAndExtractAuth, requireRole("admin"), handler);
```

### Python (decorator pattern)

Validate+extract, then RBAC/PBAC decorators.

```py
from functools import wraps

def validate_and_extract_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        access_token = decrypt(request.cookies.get("accessToken"))
        if not scalekit_client.validate_access_token(access_token):
            return jsonify({"error": "Invalid or expired token"}), 401

        token_data = scalekit_client.decode_access_token(access_token)
        request.user = {
            "id": token_data.get("sub"),
            "organization_id": token_data.get("oid"),
            "roles": token_data.get("roles", []),
            "permissions": token_data.get("permissions", []),
        }
        return f(*args, **kwargs)
    return decorated

def require_role(role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if role not in getattr(request, "user", {}).get("roles", []):
                return jsonify({"error": f"Access denied. Required role: {role}"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def require_permission(permission):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if permission not in getattr(request, "user", {}).get("permissions", []):
                return jsonify({"error": f"Access denied. Required permission: {permission}"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
```

## Patterns and pitfalls

Prefer roles for broad tiers (admin/manager/member) and permissions for granular actions like `projects:create` or `tasks:assign`.
Common patterns include "admin bypass" (admins skip some permission checks) and "resource ownership" (user can edit only their own resource unless elevated).
Avoid building authorization solely in the frontend because it can be bypassed.

## Checklist

- Token is validated before decoding/using claims.
- `roles` and `permissions` are normalizeays and attached to request context.
- Every protected route applies `requireRole(...)` and/or `requirePermission(...)` at the boundary.
- Permission names follow a consistent `resource:action` convention.
- Client-side checks are treated as UX only; server-side checks are authoritative.
