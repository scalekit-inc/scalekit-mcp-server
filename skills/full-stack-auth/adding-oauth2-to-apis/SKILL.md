---
name: adding-oauth2-to-apis
description: >
  Implements OAuth 2.0 client-credentials authentication on API endpoints using
  Scalekit as the authorization server. Use when protecting APIs with
  machine-to-machine auth, registering API clients for organizations, issuing
  bearer tokens, validating JWTs via JWKS, or enforcing scopes in middleware.
---

# Adding OAuth 2.0 to APIs (Scalekit)

## Flow overview

```
Register client (your app) → Issue client_id + secret (Scalekit) →
API client fetches bearer token → Your server validates JWT + scopes
```

Security-critical steps (token validation, scope enforcement) use **low freedom** — follow them exactly.

---

## 1. Install

```bash
pip install scalekit-sdk-python
# or
npm install @scalekit-sdk/node
```

Initialize once and reuse:

```python
from scalekit import ScalekitClient
import os

scalekit_client = ScalekitClient(
    env_url=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
    client_id=os.getenv("SCALEKIT_CLIENT_ID"),
    client_secret=os.getenv("SCALEKIT_CLIENT_SECRET")
)
```

Required env vars: `SCALEKIT_ENVIRONMENT_URL`, `SCALEKIT_CLIENT_ID`, `SCALEKIT_CLIENT_SECRET`.

---

## 2. Register an API client for an organization

One organization can have multiple API clients. Registration returns `client_id` and `plain_secret` — **`plain_secret` is shown only once; never stored by Scalekit**.

```python
from scalekit.v1.clients.clients_pb2 import OrganizationClient

response = scalekit_client.m2m_client.create_organization_client(
    organization_id="<ORG_ID>",
    m2m_client=OrganizationClient(
        name="GitHub Actions Deployment Service",
        description="Deploys to production via GitHub Actions",
        scopes=["deploy:applications", "read:deployments"],  # resource:action pattern
        audience=["deployment-api.acmecorp.com"],
        custom_claims=[
            {"key": "github_repository", "value": "acmecorp/inventory-service"},
            {"key": "environment",        "value": "production_us"}
        ],
        expiry=3600  # seconds; default 3600
    )
)

client_id    = response.client.client_id
plain_secret = response.plain_secret  # store this securely; not retrievable again
```

**cURL equivalent** (if not using SDK):

```bash
curl -X POST "$SCALEKIT_ENVIRONMENT_URL/api/v1/organizations/<ORG_ID>/clients" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SCALEKIT_ACCESS_TOKEN>" \
  -d '{
    "name": "GitHub Actions Deployment Service",
    "scopes": ["deploy:applications", "read:deployments"],
    "audience": ["deployment-api.acmecorp.com"],
    "expiry": 3600
  }'
```

> Scope naming convention: use `resource:action` (e.g. `deployments:read`, `applications:create`).

---

## 3. API client fetches a bearer token

This step runs inside the **API client's** code, not your server. Shown here for reference.

```bash
curl -X POST "$SCALEKIT_ENVIRONMENT_URL/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<API_CLIENT_ID>" \
  -d "client_secret=<API_CLIENT_SECRET>"
```

Response:

```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 86399,
  "scope": "deploy:applications read:deployments"
}
```

The client sends this JWT in `Authorization: Bearer <JWT>` on every API request.

---

## 4. Validate the JWT on your API server

**Do this on EVERY request. Never trust unverified tokens.**

### Python (SDK handles JWKS automatically)

```python
token = request.headers.get("Authorization", "").removeprefix("Bearer ")

try:
    claims = scalekit_client.validate_access_token_and_get_claims(token=token)
    # claims["scopes"] → list of granted scopes
except Exception:
    return 401  # invalid or expired
```

### Node.js (manual JWKS + JWT verify)

```js
import jwksClient from 'jwks-rsa';
import jwt from 'jsonwebtoken';

const jwks = jwksClient({
  jwksUri: `${process.env.SCALEKIT_ENVIRONMENT_URL}/.well-known/jwks.json`,
  cache: true
});

async function verifyToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  const key     = await jwks.getSigningKey(decoded.header.kid);
  return jwt.verify(token, key.getPublicKey(), {
    algorithms: ['RS256'],
    complete: true
  }).payload;          // contains scopes, sub, iss, exp, oid, etc.
}
```

Decoded JWT payload structure:

```json
{
  "client_id": "m2morg_69038819013296423",
  "oid":       "org_59615193906282635",
  "scopes":    ["deploy:applications", "read:deployments"],
  "iss":       "<SCALEKIT_ENVIRONMENT_URL>",
  "exp":       1745305340
}
```

---

## 5. Enforce scopes in middleware

### Flask (Python)

```python
import functools
from flask import request, jsonify

def require_scope(scope):
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization", "").removeprefix("Bearer ")
            if not token:
                return jsonify({"error": "Missing token"}), 401
            try:
                claims = scalekit_client.validate_access_token_and_get_claims(token=token)
            except Exception:
                return jsonify({"error": "Invalid token"}), 401
            if scope not in claims.get("scopes", []):
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

# Usage:
# @app.route('/deploy', methods=['POST'])
# @require_scope('deploy:applications')
# def deploy(): ...
```

### Express (Node.js)

```js
function requireScope(scope) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).send('Missing token');
    try {
      const payload = await verifyToken(token);      // from step 4
      if (!payload.scopes?.includes(scope))
        return res.status(403).send('Insufficient permissions');
      req.tokenClaims = payload;
      next();
    } catch {
      res.status(401).send('Invalid token');
    }
  };
}

// Usage:
// app.post('/deploy', requireScope('deploy:applications'), handler);
```

---

## Key rules

- `plain_secret` is **returned once only** — instruct customers to store it immediately.
- Always validate tokens **server-side** before trusting claims.
- Cache JWKS keys (avoid fetching on every request); rotate on `kid` mismatch.
- Use `resource:action` scope naming for clarity.
- An `organization_id` maps to one customer; multiple API clients per org are supported.
