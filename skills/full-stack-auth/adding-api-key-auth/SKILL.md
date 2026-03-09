---
name: adding-api-key-auth
description: >
  Creates, validates, lists, and revokes long-lived opaque API keys using
  Scalekit for organization-scoped or user-scoped bearer authentication.
  Use when adding API key auth to endpoints, building key management UIs,
  filtering data by org/user context, or revoking compromised credentials.
  Supports Node.js, Python, Go, and Java SDKs.
---

# Adding API Key Auth (Scalekit)

## Flow overview

```
Your app creates token (org or user scoped) → Scalekit returns key + tokenId →
Customer stores key → API client sends Bearer key → Your server validates →
Scalekit returns org/user context → Filter data accordingly
```

The plain-text API key is **returned only once at creation**. Scalekit never stores it.

---

## 1. Initialize the client

```python
# Python
from scalekit import ScalekitClient
import os

scalekit_client = ScalekitClient(
    env_url=os.environ["SCALEKIT_ENVIRONMENT_URL"],
    client_id=os.environ["SCALEKIT_CLIENT_ID"],
    client_secret=os.environ["SCALEKIT_CLIENT_SECRET"],
)
```

```javascript
// Node.js
import { ScalekitClient } from '@scalekit-sdk/node';

const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENVIRONMENT_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);
```

```go
// Go
scalekitClient := scalekit.NewScalekitClient(
  os.Getenv("SCALEKIT_ENVIRONMENT_URL"),
  os.Getenv("SCALEKIT_CLIENT_ID"),
  os.Getenv("SCALEKIT_CLIENT_SECRET"),
)
```

```java
// Java
ScalekitClient scalekitClient = new ScalekitClient(
    System.getenv("SCALEKIT_ENVIRONMENT_URL"),
    System.getenv("SCALEKIT_CLIENT_ID"),
    System.getenv("SCALEKIT_CLIENT_SECRET")
);
```

Required env vars: `SCALEKIT_ENVIRONMENT_URL`, `SCALEKIT_CLIENT_ID`, `SCALEKIT_CLIENT_SECRET`.

---

## 2. Create a token

### Organization-scoped (default)

Grants access to all resources in the organization's workspace. Use for service-to-service integrations (CI/CD, partner integrations, internal tooling).

```python
# Python
response = scalekit_client.tokens.create_token(
    organization_id=organization_id,
    description="CI/CD pipeline token",
)
opaque_token = response.token      # show to user once; never stored by Scalekit
token_id     = response.token_id   # format: apit_xxxxx — use for lifecycle ops
```

```javascript
// Node.js
const response = await scalekit.token.createToken(organizationId, {
  description: 'CI/CD pipeline token',
});
const opaqueToken = response.token;
const tokenId     = response.tokenId;
```

```go
// Go
response, err := scalekitClient.Token().CreateToken(
  ctx, organizationId, scalekit.CreateTokenOptions{
    Description: "CI/CD pipeline token",
  },
)
opaqueToken := response.Token
tokenId     := response.TokenId
```

```java
// Java
CreateTokenResponse response = scalekitClient.tokens().create(organizationId);
String opaqueToken = response.getToken();
String tokenId     = response.getTokenId();
```

### User-scoped (optional `userId`)

Adds user context so your API can filter data to only that user's resources (personal access tokens, per-user audit trails, user-level rate limiting). Attach `customClaims` for fine-grained authz without extra DB lookups.

```python
# Python
response = scalekit_client.tokens.create_token(
    organization_id=organization_id,
    user_id="usr_12345",
    custom_claims={"team": "engineering", "environment": "production"},
    description="Deployment service token",
)
```

```javascript
// Node.js
const response = await scalekit.token.createToken(organizationId, {
  userId: 'usr_12345',
  customClaims: { team: 'engineering', environment: 'production' },
  description: 'Deployment service token',
});
```

```go
// Go
response, err := scalekitClient.Token().CreateToken(
  ctx, organizationId, scalekit.CreateTokenOptions{
    UserId:       "usr_12345",
    CustomClaims: map[string]string{"team": "engineering", "environment": "production"},
    Description:  "Deployment service token",
  },
)
```

```java
// Java
Map<String, String> claims = Map.of("team", "engineering", "environment", "production");
CreateTokenResponse response = scalekitClient.tokens().create(
    organizationId, "usr_12345", claims, null, "Deployment service token"
);
```

**Response fields:**

| Field        | Description                                               |
|--------------|-----------------------------------------------------------|
| `token`      | Plain-text API key. **Returned only at creation.**        |
| `token_id`   | Stable ID (`apit_xxxxx`) for list/invalidate operations.  |
| `token_info` | Metadata: org, user, custom claims, timestamps.           |

---

## 3. Validate a token

Call this on every incoming API request. Returns org/user context; throws on invalid, expired, or revoked keys.

```python
# Python
from scalekit import ScalekitValidateTokenFailureException

try:
    result = scalekit_client.tokens.validate_token(token=opaque_token)
    org_id   = result.token_info.organization_id
    user_id  = result.token_info.user_id          # empty for org-scoped keys
    claims   = result.token_info.custom_claims
    roles    = result.token_info.roles             # populated if RBAC is configured
    ext_org  = result.token_info.organization_external_id
except ScalekitValidateTokenFailureException:
    return 401
```

```javascript
// Node.js
import { ScalekitValidateTokenFailureException } from '@scalekit-sdk/node';

try {
  const result = await scalekit.token.validateToken(opaqueToken);
  const { organizationId, userId, customClaims, roles, organizationExternalId } = result.tokenInfo;
} catch (error) {
  if (error instanceof ScalekitValidateTokenFailureException) return res.status(401).end();
  throw error;
}
```

```go
// Go
result, err := scalekitClient.Token().ValidateToken(ctx, opaqueToken)
if errors.Is(err, scalekit.ErrTokenValidationFailed) {
  c.JSON(401, gin.H{"error": "Invalid or expired token"})
  return
}
orgId  := result.TokenInfo.OrganizationId
userId := result.TokenInfo.GetUserId()       // *string — nil for org-scoped tokens
claims := result.TokenInfo.CustomClaims
```

```java
// Java
try {
    ValidateTokenResponse result = scalekitClient.tokens().validate(opaqueToken);
    String orgId  = result.getTokenInfo().getOrganizationId();
    String userId = result.getTokenInfo().getUserId();
    Map<String, String> claims = result.getTokenInfo().getCustomClaimsMap();
} catch (TokenInvalidException e) {
    response.sendError(401);
}
```

---

## 4. List tokens

Supports pagination and optional user filter.

```python
# Python — list with pagination
response = scalekit_client.tokens.list_tokens(
    organization_id=organization_id,
    page_size=10,
)
for token in response.tokens:
    print(token.token_id, token.description)

if response.next_page_token:
    next_page = scalekit_client.tokens.list_tokens(
        organization_id=organization_id,
        page_size=10,
        page_token=response.next_page_token,
    )

# Filter by user
user_tokens = scalekit_client.tokens.list_tokens(
    organization_id=organization_id,
    user_id="usr_12345",
)
```

```javascript
// Node.js
const response = await scalekit.token.listTokens(organizationId, { pageSize: 10 });
if (response.nextPageToken) {
  const next = await scalekit.token.listTokens(organizationId, {
    pageSize: 10, pageToken: response.nextPageToken
  });
}
const userTokens = await scalekit.token.listTokens(organizationId, { userId: 'usr_12345' });
```

---

## 5. Invalidate a token

Revocation is **instant** — the next validation for that key fails immediately.
The operation is **idempotent**: safe to call on already-revoked keys.

```python
# Python — by token string or token_id
scalekit_client.tokens.invalidate_token(token=opaque_token)
# or
scalekit_client.tokens.invalidate_token(token=token_id)
```

```javascript
// Node.js
await scalekit.token.invalidateToken(opaqueToken);  // or tokenId
```

```go
// Go
_ = scalekitClient.Token().InvalidateToken(ctx, opaqueToken)  // or tokenId
```

```java
// Java
scalekitClient.tokens().invalidate(opaqueToken);  // or tokenId
```

---

## 6. Middleware pattern (protect endpoints)

```python
# Python — Flask decorator
from functools import wraps
from flask import request, jsonify, g
from scalekit import ScalekitValidateTokenFailureException

def authenticate_token(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing authorization token"}), 401
        try:
            result = scalekit_client.tokens.validate_token(token=auth.split(" ", 1)[1])
            g.token_info = result.token_info
        except ScalekitValidateTokenFailureException:
            return jsonify({"error": "Invalid or expired token"}), 401
        return f(*args, **kwargs)
    return wrapper

@app.route("/api/resources")
@authenticate_token
def get_resources():
    org_id  = g.token_info.organization_id   # always present
    user_id = g.token_info.user_id            # present only for user-scoped keys
    # query DB filtered by org_id (and user_id if set)
```

```javascript
// Node.js — Express middleware
async function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const result = await scalekit.token.validateToken(token);
    req.tokenInfo = result.tokenInfo;
    next();
  } catch (error) {
    if (error instanceof ScalekitValidateTokenFailureException)
      return res.status(401).json({ error: 'Invalid or expired token' });
    throw error;
  }
}

app.get('/api/resources', authenticateToken, (req, res) => {
  const { organizationId, userId } = req.tokenInfo;
});
```

```go
// Go — Gin middleware
func AuthenticateToken(sc scalekit.Scalekit) gin.HandlerFunc {
  return func(c *gin.Context) {
    token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
    if token == "" {
      c.JSON(401, gin.H{"error": "Missing authorization token"}); c.Abort(); return
    }
    result, err := sc.Token().ValidateToken(c.Request.Context(), token)
    if err != nil {
      c.JSON(401, gin.H{"error": "Invalid or expired token"}); c.Abort(); return
    }
    c.Set("tokenInfo", result.TokenInfo)
    c.Next()
  }
}
```

### Data filtering pattern

| Key type            | Filter query by                 | Example use case                        |
|---------------------|---------------------------------|-----------------------------------------|
| Organization-scoped | `organizationId` only           | All workspace contacts in a CRM         |
| User-scoped         | `organizationId` + `userId`     | Only tasks assigned to the calling user |
| Custom claims       | Claims from `customClaims` map  | Restrict by `environment`, `team`, etc. |

---

## Key rules

- **Show `token` once**: Display to user at creation, then discard — Scalekit cannot retrieve it.
- **Validate server-side on every request**: Never trust unverified tokens; call `validateToken` each time.
- **Use `token_id` for lifecycle ops**: Store `token_id` (not the key itself) for list/invalidate workflows.
- **Rotate safely**: Create new key → update consumer → verify → invalidate old key (avoids downtime).
- **Use `expiry` for time-limited access**: Limits blast radius if a key is compromised.
- **Never log or commit keys**: Treat API keys like passwords — use encrypted secrets managers or env vars.
