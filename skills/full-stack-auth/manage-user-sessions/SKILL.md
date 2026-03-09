---
name: managing-user-sessions
description: Manages Scalekit-backed user sessions by securely storing access/refresh/ID tokens (with encryption and correct cookie attributes), validating access tokens on every request, transparently refreshing tokens in middleware, and optionally revoking sessions remotely via Scalekit session APIs. Use when building session persistence for only for web apps. For SPAs this is NOT the skill.
---

# Manage user sessions (Scalekit FSA)

## Skill contract
This SKILL.md must include `name` and `description` frontmatter fields, and the description should be written in third person for reliable skill discovery.

## What “session management” means here
After successful authentication, the app receives session tokens (typically access + refresh, and sometimes an ID token) that determine how long the user stays signed in and whether refresh can happen without re-authentication.

This skill implements a secure default for traditional web apps (encrypted HttpOnly cookies) and also supports SPA/mobile patterns (access token in memory + `Authorization: Bearer` headers).

## Inputs to collect (ask before coding)
- App type: traditional server-rendered web app, SPA, mobile app, or hybrid.
- Framework: Express/Fastify/Next (Node), Flask/Django/FastAPI (Python), Gin/Fiber (Go), Spring Boot (Java), etc.
- Token storage plan:
  - Cookie names (examples used below: `accessToken`, `refreshToken`, `idToken`).
  - Cookie attributes actually used in the repo (Path, Domain, Secure, HttpOnly, SameSite).
- Encryption approach already present (KMS, libsodium, AES-GCM, framework session store), or whether the app needs one introduced.
- Scalekit SDK/client availability and the exact methods used (validate, refresh, sessions list/revoke).

## Non-negotiable security rules (defaults)
- Store access and refresh tokens separately.
- Use HttpOnly cookies for tokens in traditional web apps to reduce XSS exposure.
- Use `Secure` in production (HTTPS-only) and set `SameSite` to `Strict` (or `Lax` if Strict breaks auth redirects).
- Scope cookies with `Path` to reduce exposure:
  - Access token cookie: scope to `/api` (or your protected routes) when possible.
  - Refresh token cookie: scope to the refresh endpoint only (example `/auth/refresh`).
- Rotate refresh tokens on each refresh if your Scalekit flow supports it (token rotation helps detect theft).

## Workflow (implementation sequence)
1. Implement “store tokens” at login completion.
2. Implement “verify + refresh” middleware that runs on every protected request.
3. Implement a dedicated refresh endpoint (recommended even if middleware calls refresh internally).
4. Add logout and remote session revocation if the product needs “sign out this device / sign out all devices”.
5. Add a test checklist (cookie flags, refresh flow, failure modes).

## 1) Store session tokens securely

### Cookie-based approach (traditional web apps)
Use encryption-in-cookie as an extra layer, then store:
- Access token in an HttpOnly cookie with short TTL.
- Refresh token in a separate HttpOnly cookie, ideally scoped to the refresh route.
- ID token in a place that remains available at runtime if needed for logout flows (cookie or local storage depending on your logout design).

#### Node.js (Express)
```js
import cookieParser from "cookie-parser";
app.use(cookieParser());

// Example after successful authentication:
const { accessToken, expiresIn, refreshToken, idToken } = authResult;

// Encrypt before storing (implementation is app-specific)
const encAccess = encrypt(accessToken);
const encRefresh = encrypt(refreshToken);

// Access token: short-lived, cookie scoped
res.cookie("accessToken", encAccess, {
  maxAge: (expiresIn - 60) * 1000, // clock-skew buffer
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api",
});

// Refresh token: separate cookie, scoped to refresh endpoint
res.cookie("refreshToken", encRefresh, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/auth/refresh",
});

// Optional: ID token for logout (only if your logout needs it)
if (idToken) {
  res.cookie("idToken", idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}
```

#### Python (Flask)
```py
from flask import make_response
import os

# auth_result: access_token, expires_in, refresh_token, id_token (optional)
enc_access = encrypt(auth_result.access_token)
enc_refresh = encrypt(auth_result.refresh_token)

resp = make_response()

resp.set_cookie(
  "accessToken",
  enc_access,
  max_age=auth_result.expires_in - 60,
  httponly=True,
  secure=os.environ.get("FLASK_ENV") == "production",
  samesite="Strict",
  path="/api",
)

resp.set_cookie(
  "refreshToken",
  enc_refresh,
  httponly=True,
  secure=os.environ.get("FLASK_ENV") == "production",
  samesite="Strict",
  path="/auth/refresh",
)

if getattr(auth_result, "id_token", None):
  resp.set_cookie(
    "idToken",
    auth_result.id_token,
    httponly=True,
    secure=os.environ.get("FLASK_ENV") == "production",
    samesite="Strict",
    path="/",
  )
```

#### Go (Gin)
```go
// accessToken, refreshToken, expiresIn come from your auth completion result
encAccess := encrypt(accessToken)
encRefresh := encrypt(refreshToken)

c.SetSameSite(http.SameSiteStrictMode)

c.SetCookie("accessToken", encAccess, expiresIn-60, "/api", "", isProd(), true)
c.SetCookie("refreshToken", encRefresh, 0, "/auth/refresh", "", isProd(), true)

// Optional
if idToken != "" {
  c.SetCookie("idToken", idToken, 0, "/", "", isProd(), true)
}
```

#### Java (Spring)
```java
// Encrypt tokens before storing (implementation is app-specific)
String encAccess = encrypt(authResult.getAccessToken());
String encRefresh = encrypt(authResult.getRefreshToken());

Cookie access = new Cookie("accessToken", encAccess);
access.setMaxAge(authResult.getExpiresIn() - 60);
access.setHttpOnly(true);
access.setSecure(isProd());
access.setPath("/api");
response.addCookie(access);
// Ensure SameSite is applied (implementation depends on your framework version)

Cookie refresh = new Cookie("refreshToken", encRefresh);
refresh.setHttpOnly(true);
refresh.setSecure(isProd());
refresh.setPath("/auth/refresh");
response.addCookie(refresh);
```

### SPA/mobile note (reduce CSRF exposure)
For SPAs and mobile apps, prefer:
- Access token stored in memory and sent via `Authorization: Bearer <token>`.
- Refresh token stored in an HttpOnly cookie or secure device storage (platform dependent).
If using cookies in a browser SPA, configure CSRF protections explicitly.

## 2) Validate access token on every request (and refresh transparently)

### Behavior
- If access token is valid: proceed.
- If access token is expired and refresh token exists: refresh, rotate, rewrite cookies/headers, proceed.
- If refresh fails: return 401 and force re-login.

### Node.js middleware (Express-style)
```js
export async function verifySession(req, res, next) {
  const accessCookie = req.cookies?.accessToken;
  const refreshCookie = req.cookies?.refreshToken;

  if (!accessCookie) return res.status(401).json({ error: "Authentication required" });

  try {
    const accessToken = decrypt(accessCookie);
    const isValid = await scalekit.validateAccessToken(accessToken);

    if (isValid) return next();

    // Not valid -> attempt refresh
    if (!refreshCookie) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }

    const refreshToken = decrypt(refreshCookie);
    const authResult = await scalekit.refreshAccessToken(refreshToken);

    res.cookie("accessToken", encrypt(authResult.accessToken), {
      maxAge: (authResult.expiresIn - 60) * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api",
    });

    res.cookie("refreshToken", encrypt(authResult.refreshToken), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth/refresh",
    });

    return next();
  } catch (e) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}
```

### Python decorator (Flask)
```py
from functools import wraps
from flask import request, jsonify, make_response

def verify_session(f):
  @wraps(f)
  def inner(*args, **kwargs):
    access_cookie = request.cookies.get("accessToken")
    refresh_cookie = request.cookies.get("refreshToken")

    if not access_cookie:
      return jsonify({"error": "Authentication required"}), 401

    try:
      access_token = decrypt(access_cookie)
      is_valid = scalekit_client.validate_access_token(access_token)

      if is_valid:
        return f(*args, **kwargs)

      if not refresh_cookie:
        return jsonify({"error": "Session expired. Please sign in again."}), 401

      refresh_token = decrypt(refresh_cookie)
      auth_result = scalekit_client.refresh_access_token(refresh_token)

      resp = make_response(f(*args, **kwargs))
      resp.set_cookie("accessToken", encrypt(auth_result.access_token),
                      max_age=auth_result.expires_in - 60, httponly=True,
                      secure=is_prod(), samesite="Strict", path="/api")
      resp.set_cookie("refreshToken", encrypt(auth_result.refresh_token),
                      httponly=True, secure=is_prod(), samesite="Strict", path="/auth/refresh")
      return resp
    except Exception:
      return jsonify({"error": "Authentication failed"}), 401
  return inner
```

### Go middleware (Gin)
```go
func VerifySession() gin.HandlerFunc {
  return func(c *gin.Context) {
    accessCookie, err := c.Cookie("accessToken")
    if err != nil || accessCookie == "" {
      c.JSON(http.StatusUnauthorized, gin.H{"error":"Authentication required"})
      c.Abort()
      return
    }

    accessToken := decrypt(accessCookie)
    isValid, err := scalekitClient.ValidateAccessToken(accessToken)
    if err == nil && isValid {
      c.Next()
      return
    }

    refreshCookie, err := c.Cookie("refreshToken")
    if err != nil || refreshCookie == "" {
      c.JSON(http.StatusUnauthorized, gin.H{"error":"Session expired. Please sign in again."})
      c.Abort()
      return
    }

    refreshToken := decrypt(refreshCookie)
    authResult, err := scalekitClient.RefreshAccessToken(refreshToken)
    if err != nil {
      c.JSON(http.StatusUnauthorized, gin.H{"error":"Session expired. Please sign in again."})
      c.Abort()
      return
    }

    c.SetSameSite(http.SameSiteStrictMode)
    c.SetCookie("accessToken", encrypt(authResult.AccessToken), authResult.ExpiresIn-60, "/api", "", isProd(), true)
    c.SetCookie("refreshToken", encrypt(authResult.RefreshToken), 0, "/auth/refresh", "", isProd(), true)

    c.Next()
  }
}
```

### Java interceptor (Spring)
Implement `HandlerInterceptor#preHandle` (or a filter) to:
- Read cookies.
- Decrypt and validate access token.
- Refresh when invalid and refresh token exists.
- Rewrite cookies and allow the request to proceed.
Return 401 on failure.

## 3) Configure session security and duration (dashboard-driven)
Session behavior should be adjustable without code changes (typical policy knobs):
- Absolute session timeout (max total session time).
- Idle session timeout (logout after inactivity).
- Access token lifetime (drives refresh frequency).

## 4) Manage sessions remotely (API/SDK)
Use Scalekit session APIs to implement:
- “View active sessions” in account settings.
- “Sign out this device” (revoke a single session).
- “Sign out all devices” (revoke all sessions for a user).

### Example (Node.js)
```js
const sessionDetails = await scalekit.session.getSession("ses_1234567890123456");

const userSessions = await scalekit.session.getUserSessions("usr_1234567890123456", {
  pageSize: 10,
  filter: { status: ["ACTIVE"] }
});

await scalekit.session.revokeSession("ses_1234567890123456");
await scalekit.session.revokeAllUserSessions("usr_1234567890123456");
```

## Testing checklist (must pass)
- Cookies are `HttpOnly`, `Secure` (in prod), and `SameSite` is set intentionally.
- Cookie `Path` scoping works: refresh token cookie is only sent to `/auth/refresh`.
- Protected routes reject missing/invalid access token with 401.
- Expired access token triggers refresh and continues the request without user interaction.
- Refresh failure forces re-login (401) and does not loop.
- Multi-device: remote revoke invalidates the targeted session(s) as expected.

## Common failure modes
- Cookie deletion/overwrite doesn’t work due to mismatched Path/Domain.
- Refresh token accidentally sent to all endpoints (missing `Path=/auth/refresh`).
- Middleware refreshes but does not rotate tokens (misses theft detection benefits).
- SPA stores access token in localStorage (higher XSS risk) when memory storage was feasible.