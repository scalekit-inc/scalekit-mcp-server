---
name: implementing-scalekit-go-auth
description: Guides Go developers implementing Scalekit authentication in Gin-based web apps using scalekit-sdk-go. Use when the developer mentions Scalekit, enterprise SSO, OIDC login, OAuth2 callback, access token validation, token refresh, session cookies, logout, IDP-initiated login, or xoid/xuid JWT claims in a Go project.
---

# Scalekit Auth in Go (Gin)

Scalekit is an OIDC/OAuth2 provider. Unlike frameworks that auto-wire OAuth2, Go requires you to
manually implement four handlers: **authorize → callback → session → logout**. Use `scalekit-sdk-go/v2`.

## Dependencies

```bash
go get github.com/scalekit-inc/scalekit-sdk-go/v2
go get github.com/gin-gonic/gin
go get github.com/gin-contrib/cors
go get github.com/golang-jwt/jwt/v5
```

## Environment variables

```bash
SCALEKIT_ENVIRONMENT_URL=https://your-env.scalekit.dev
SCALEKIT_CLIENT_ID=your_client_id
SCALEKIT_CLIENT_SECRET=your_client_secret
PORT=8080
```

Never commit secrets. Load with `godotenv` or equivalent.

## Global client — initialize once

Use `sync.Once` so the client is created exactly once across all requests:

```go
var (
    globalClient scalekit.Scalekit
    clientOnce   sync.Once
    clientErr    error
)

func GetScaleKitClient() (scalekit.Scalekit, error) {
    clientOnce.Do(func() {
        envURL  := os.Getenv("SCALEKIT_ENVIRONMENT_URL")
        id      := os.Getenv("SCALEKIT_CLIENT_ID")
        secret  := os.Getenv("SCALEKIT_CLIENT_SECRET")
        globalClient = scalekit.NewScalekitClient(envURL, id, secret)
    })
    return globalClient, clientErr
}
```

Call `GetScaleKitClient()` once at startup to fail fast on bad credentials.

## Auth flow at a glance

```
GET /api/authorize
  → GetAuthorizationUrl()  → 302 to Scalekit

GET /api/scalekit/callback?code=...
  → AuthenticateWithCode() → redirect to /dashboard or /onboarding

GET /api/session           (every page load)
  → ValidateAccessToken()  → refresh if expired → return user JSON

GET /api/logout
  → GetLogoutUrl()         → clear cookies → 302 to Scalekit end-session
```

## Handler: Authorize

Builds the authorization URL and redirects the browser:

```go
func AuthorizeHandler(c *gin.Context) {
    sc, _ := GetScaleKitClient()

    stateBytes, _ := json.Marshal(map[string]any{
        "next": c.Query("next"),
        "csrf": randomString(12),
    })
    state := base64.StdEncoding.EncodeToString(stateBytes)

    opts := scalekit.AuthorizationUrlOptions{
        State:  state,
        Scopes: []string{"openid", "profile", "email", "offline_access"},
    }
    // Scope to a specific org, connection, or hint when provided
    if v := c.Query("organization_id"); v != "" { opts.OrganizationId = v }
    if v := c.Query("connection_id");   v != "" { opts.ConnectionId   = v }
    if v := c.Query("login_hint");      v != "" { opts.LoginHint      = v }

    authURL, err := sc.GetAuthorizationUrl(callbackURL(c), opts)
    if err != nil {
        c.JSON(500, gin.H{"error": "Failed to build authorization URL"})
        return
    }
    c.Redirect(http.StatusFound, authURL.String())
}

func callbackURL(c *gin.Context) string {
    proto := "https"
    if strings.Contains(c.Request.Host, "localhost") { proto = "http" }
    return proto + "://" + c.Request.Host + "/api/scalekit/callback"
}
```

## Handler: Callback

Exchange the authorization code for tokens; set httpOnly cookies:

```go
func CallbackHandler(c *gin.Context) {
    if e := c.Query("error"); e != "" {
        c.JSON(400, gin.H{"error": c.Query("error_description")})
        return
    }

    sc, _ := GetScaleKitClient()
    resp, err := sc.AuthenticateWithCode(
        c.Request.Context(),
        c.Query("code"),
        callbackURL(c),
        scalekit.AuthenticationOptions{},
    )
    if err != nil {
        c.JSON(500, gin.H{"error": "Token exchange failed"})
        return
    }

    c.SetCookie("auth_access_token",  resp.AccessToken,  86400,   "/", "", false, true)
    c.SetCookie("auth_refresh_token", resp.RefreshToken, 2592000, "/", "", false, true)
    c.SetCookie("id_token",           resp.IdToken,      86400,   "/", "", false, false)

    // Route: no org in token → new user needs onboarding
    claims, _ := decodeJWTPayload(resp.AccessToken)
    redirect := "/onboarding"
    if _, hasOrg := claims["xoid"]; hasOrg {
        redirect = "/dashboard"
    }
    c.Redirect(http.StatusFound, getUIBaseURL(c)+redirect)
}
```

`resp` fields: `AccessToken`, `RefreshToken`, `IdToken`, `User` (email, name, etc.).

## Handler: Session

Validate on every authenticated page load; silently refresh expired tokens:

```go
func SessionHandler(c *gin.Context) {
    accessToken,  _ := c.Cookie("auth_access_token")
    refreshToken, _ := c.Cookie("auth_refresh_token")

    sc, _ := GetScaleKitClient()

    valid, err := sc.ValidateAccessToken(c.Request.Context(), accessToken)
    if err != nil || !valid {
        refreshed, err := sc.RefreshAccessToken(c.Request.Context(), refreshToken)
        if err != nil {
            LogoutHandler(c) // force re-login
            return
        }
        c.SetCookie("auth_access_token",  refreshed.AccessToken,  86400,   "/", "", false, true)
        c.SetCookie("auth_refresh_token", refreshed.RefreshToken, 2592000, "/", "", false, true)
        accessToken = refreshed.AccessToken
    }

    claims, _ := decodeJWTPayload(accessToken)
    userID, _  := getStringClaim(claims, "sub")

    userResp, _ := sc.User().GetUser(context.Background(), userID)
    c.JSON(200, gin.H{
        "authenticated": true,
        "user": gin.H{
            "id":         userResp.User.Id,
            "email":      userResp.User.Email,
            "first_name": userResp.User.UserProfile.FirstName,
            "last_name":  userResp.User.UserProfile.LastName,
        },
    })
}
```

## Handler: Logout

Clear all cookies and redirect to Scalekit's end-session endpoint:

```go
func LogoutHandler(c *gin.Context) {
    idToken, _ := c.Cookie("id_token")
    sc, _      := GetScaleKitClient()

    logoutURL, _ := sc.GetLogoutUrl(scalekit.LogoutUrlOptions{
        IdTokenHint:           idToken,
        PostLogoutRedirectUri: getUIBaseURL(c),
    })

    c.SetCookie("auth_access_token",  "", -1, "/", "", false, true)
    c.SetCookie("auth_refresh_token", "", -1, "/", "", false, true)
    c.SetCookie("id_token",           "", -1, "/", "", false, false)
    c.Redirect(http.StatusFound, logoutURL.String())
}
```

## Handler: IDP-initiated login (enterprise SSO)

When an IdP starts the login (e.g. Okta tile click), Scalekit sends a signed JWT:

```go
func IdpInitiatedLoginHandler(c *gin.Context) {
    sc, _ := GetScaleKitClient()
    claims, err := sc.GetIdpInitiatedLoginClaims(
        c.Request.Context(),
        c.Query("idp_initiated_login"),
    )
    if err != nil {
        c.JSON(400, gin.H{"error": "invalid idp_initiated_login token"})
        return
    }
    opts := scalekit.AuthorizationUrlOptions{
        Scopes: []string{"openid", "profile", "email", "offline_access"},
    }
    if claims.OrganizationID != "" { opts.OrganizationId = claims.OrganizationID }
    if claims.ConnectionID   != "" { opts.ConnectionId   = claims.ConnectionID   }
    if claims.LoginHint      != "" { opts.LoginHint      = claims.LoginHint      }

    authURL, _ := sc.GetAuthorizationUrl(callbackURL(c), opts)
    c.Redirect(http.StatusFound, authURL.String())
}
```

## JWT utility helpers

```go
// decodeJWTPayload decodes the payload of a JWT without verifying the signature.
// Always use ValidateAccessToken() for security — this is only for claim extraction after validation.
func decodeJWTPayload(token string) (map[string]interface{}, error) {
    parts := strings.Split(token, ".")
    if len(parts) != 3 {
        return nil, fmt.Errorf("invalid JWT format")
    }
    payload, err := base64.RawURLEncoding.DecodeString(parts[1])
    if err != nil {
        return nil, err
    }
    var claims map[string]interface{}
    return claims, json.Unmarshal(payload, &claims)
}

func getStringClaim(claims map[string]interface{}, key string) (string, error) {
    v, ok := claims[key].(string)
    if !ok || v == "" {
        return "", fmt.Errorf("claim %q missing or empty", key)
    }
    return v, nil
}
```

## Scalekit JWT claims reference

| Claim | Meaning | Notes |
|---|---|---|
| `sub` | Scalekit user ID | Always present |
| `xoid` | External org ID (e.g. `wspace_abc`) | Absent → user has no org yet → send to `/onboarding` |
| `xuid` | Your app's user DB ID | Absent → create user locally, then call `UpdateUser` to write it back |
| `permissions` | User permissions in org | Check before authorizing sensitive actions |
| `roles` | User roles in org | Derive `is_admin` from role names |

## Route registration

```go
api := r.Group("/api")
api.GET("/authorize",         AuthorizeHandler)
api.GET("/login/initiate",    IdpInitiatedLoginHandler)
api.GET("/scalekit/callback", CallbackHandler)
api.GET("/session",           SessionHandler)
api.GET("/logout",            LogoutHandler)
```

## CORS — required for cookie-based auth

```go
r.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"https://yourdomain.com"},
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    AllowCredentials: true, // MUST be true when cookies carry tokens
    MaxAge:           12 * time.Hour,
}))
```

## Implementation checklist

```
- [ ] Step 1: go get scalekit-sdk-go/v2, gin, cors, jwt/v5
- [ ] Step 2: Set SCALEKIT_ENVIRONMENT_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET in .env
- [ ] Step 3: Create handlers/client.go — sync.Once singleton
- [ ] Step 4: Create handlers/utils.go — decodeJWTPayload, getStringClaim, callbackURL, getUIBaseURL
- [ ] Step 5: Implement AuthorizeHandler → GetAuthorizationUrl → redirect
- [ ] Step 6: Implement CallbackHandler → AuthenticateWithCode → set cookies → redirect
- [ ] Step 7: Implement SessionHandler → ValidateAccessToken → RefreshAccessToken if expired
- [ ] Step 8: Implement LogoutHandler → GetLogoutUrl → clear cookies → redirect
- [ ] Step 9: Register all four routes under /api
- [ ] Step 10: Configure CORS with AllowCredentials: true
- [ ] Step 11: Register callback URI in Scalekit dashboard
- [ ] Step 12: Test: login → /dashboard → GET /api/session → logout
```

## Troubleshooting

**`invalid_grant` on callback**: The `redirectURL` in `AuthenticateWithCode` must exactly match the URI registered in the Scalekit dashboard — including scheme and path. One mismatch silently breaks the exchange.

**Session handler stuck in logout loop**: `ValidateAccessToken` returns `false` on both expiry *and* network errors. Log `err` before deciding to refresh vs. logout so you can distinguish the two.

**`xoid` missing**: The user has no organization. This is expected for new signups — route to `/onboarding` to create or join a workspace.

**CORS / cookie not sent**: Ensure `AllowCredentials: true` is set in CORS config. Without it, the browser strips cookies from cross-origin requests.

**`toExternalWorkspaceID` format**: Internal org IDs are `org_<id>`. Strip the prefix and prepend `wspace_` to get the external workspace ID used in the access token's `xoid` claim.

## Reference

- Full working example: [scalekit-inc/coffee-desk-demo](https://github.com/scalekit-inc/coffee-desk-demo)
- Scalekit Go SDK: [scalekit-inc/scalekit-sdk-go](https://github.com/scalekit-inc/scalekit-sdk-go)
- Scalekit docs: https://docs.scalekit.com

## Tactics

### SameSite=Lax — set explicitly on each cookie

Gin's `c.SetCookie` does not expose a `SameSite` parameter. Use `http.SetCookie` directly for full control:

```go
http.SetCookie(c.Writer, &http.Cookie{
    Name:     "auth_access_token",
    Value:    resp.AccessToken,
    Path:     "/",
    MaxAge:   86400,
    HttpOnly: true,
    SameSite: http.SameSiteLaxMode, // Required — Strict drops cookie on OAuth redirect back
    Secure:   !strings.Contains(c.Request.Host, "localhost"),
})
```

`SameSite: Strict` drops the session cookie on the cross-origin redirect from Scalekit back to `/api/scalekit/callback` — the callback receives no cookies and the auth flow breaks silently.

### Secure flag in production

Never hardcode `secure: false`. Detect localhost at runtime:

```go
func isSecure(c *gin.Context) bool {
    return !strings.Contains(c.Request.Host, "localhost")
}
```

Pass `Secure: isSecure(c)` when setting every cookie. This ensures `Secure` is always set in production (HTTPS) without breaking local development.

### CSRF via state parameter

The base64-encoded state in `AuthorizeHandler` already carries a CSRF token (`"csrf": randomString(12)`). Validate it in `CallbackHandler` before exchanging the code:

```go
stateRaw, err := base64.StdEncoding.DecodeString(c.Query("state"))
if err != nil {
    c.JSON(400, gin.H{"error": "invalid state"})
    return
}
var stateData map[string]string
json.Unmarshal(stateRaw, &stateData)
// Optionally compare stateData["csrf"] against a cookie set in AuthorizeHandler
```

For stronger CSRF protection, store the `csrf` value in a short-lived cookie in `AuthorizeHandler` and verify it matches in `CallbackHandler`.

### Deep link preservation via state

The state JSON already includes `"next"`. After a successful callback, extract it and redirect:

```go
next := stateData["next"]
if next == "" || !strings.HasPrefix(next, "/") {
    next = "/dashboard" // prevent open redirect
}
c.Redirect(http.StatusFound, getUIBaseURL(c)+next)
```

Never redirect to an absolute URL from state — only relative paths starting with `/`.

### Cache-Control: no-store on protected endpoints

After logout, the browser back button can serve a cached `/api/session` response showing the user as authenticated. Add the header on every session/protected response:

```go
func SessionHandler(c *gin.Context) {
    c.Header("Cache-Control", "no-store")
    // ...
}
```

### Token refresh race condition

Multiple browser tabs hitting `/api/session` simultaneously can each attempt a refresh with the same refresh token — the second call will receive `invalid_grant`. Use a per-user mutex or a distributed lock:

```go
var refreshMu sync.Map // keyed by refresh token hash

func SessionHandler(c *gin.Context) {
    refreshToken, _ := c.Cookie("auth_refresh_token")
    key := fmt.Sprintf("%x", sha256.Sum256([]byte(refreshToken)))

    mu, _ := refreshMu.LoadOrStore(key, &sync.Mutex{})
    mu.(*sync.Mutex).Lock()
    defer mu.(*sync.Mutex).Unlock()
    // ...refresh logic...
}
```

For stateless deployments, treat `invalid_grant` on refresh as a session expiry and redirect to login rather than erroring.

### 401 vs redirect for JSON clients

If a JavaScript frontend calls `/api/session` and gets a `302` redirect, the browser follows it silently and the client receives HTML instead of JSON. Return `401` for `Accept: application/json` requests:

```go
func SessionHandler(c *gin.Context) {
    accessToken, err := c.Cookie("auth_access_token")
    if err != nil || accessToken == "" {
        if strings.Contains(c.GetHeader("Accept"), "application/json") {
            c.JSON(401, gin.H{"error": "unauthenticated"})
        } else {
            c.Redirect(http.StatusFound, "/login")
        }
        return
    }
    // ...
}
```
