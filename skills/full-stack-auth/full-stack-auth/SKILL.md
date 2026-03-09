---
name: implementing-scalekit-fsa
description: Implements Scalekit full-stack authentication (FSA) including sign-up, login, logout, and secure session management using JWT tokens. Use when building or integrating user authentication with the Scalekit SDK across Node.js, Python, Go, or Java — or when the user asks about auth flows, OAuth callbacks, token refresh, or session handling with Scalekit.
---

# Scalekit Full-Stack Authentication

## Setup

Install the SDK and set credentials in `.env`:

```sh
SCALEKIT_ENVIRONMENT_URL=<your-environment-url>
SCALEKIT_CLIENT_ID=<your-client-id>
SCALEKIT_CLIENT_SECRET=<your-client-secret>
```

## Auth flow

### 1. Redirect to login

Generate an authorization URL and redirect the user:

```js
// Node.js
const authorizationUrl = scalekit.getAuthorizationUrl(redirectUri, {
  scopes: ['openid', 'profile', 'email', 'offline_access']
});
res.redirect(authorizationUrl);
```

> `redirectUri` must exactly match the allowed callback URL registered in the Scalekit dashboard.

### 2. Handle the callback

Exchange the authorization code for tokens:

```js
// Node.js
const { user, idToken, accessToken, refreshToken } =
  await scalekit.authenticateWithCode(code, redirectUri);
```

| Token | Purpose |
|---|---|
| `idToken` | Full user profile (sub, oid, email, name, exp) |
| `accessToken` | Roles + permissions; expires in 5 min (configurable) |
| `refreshToken` | Long-lived; use to renew access tokens |

### 3. Create the session

Store tokens in HttpOnly cookies:

```js
// Node.js
res.cookie('accessToken', authResult.accessToken, {
  maxAge: (authResult.expiresIn - 60) * 1000,
  httpOnly: true, secure: true, path: '/api', sameSite: 'strict'
});
res.cookie('refreshToken', authResult.refreshToken, {
  httpOnly: true, secure: true, path: '/auth/refresh', sameSite: 'strict'
});
```

**Token validation middleware pattern:**
1. Read `accessToken` cookie → decrypt → `scalekit.validateAccessToken(token)`
2. If invalid → `scalekit.refreshAccessToken(refreshToken)` → update cookies
3. If refresh fails → log out the user

### 4. Log out

Clear session data, then redirect to Scalekit's logout endpoint:

```js
// Node.js
clearSessionData();
const logoutUrl = scalekit.getLogoutUrl(idTokenHint, postLogoutRedirectUri);
res.redirect(logoutUrl); // One-time use URL; expires after logout
```

## Cross-language reference

All SDK methods follow the same pattern across languages with minor naming conventions:

| Operation | Node.js | Python | Go | Java |
|---|---|---|---|---|
| Auth URL | `getAuthorizationUrl` | `get_authorization_url` | `GetAuthorizationUrl` | `getAuthorizationUrl` |
| Exchange code | `authenticateWithCode` | `authenticate_with_code` | `AuthenticateWithCode` | `authenticateWithCode` |
| Validate token | `validateAccessToken` | `validate_access_token` | `ValidateAccessToken` | `validateAccessToken` |
| Refresh token | `refreshAccessToken` | `refresh_access_token` | `RefreshAccessToken` | `refreshToken` |
| Logout URL | `getLogoutUrl` | `get_logout_url` | `GetLogoutUrl` | `getLogoutUrl` |

## What this unlocks

One integration enables: Magic Link & OTP, social sign-ins, enterprise SSO, workspaces, MCP authentication, SCIM provisioning, and user management.
