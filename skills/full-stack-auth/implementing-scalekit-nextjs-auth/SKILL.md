---
name: implementing-scalekit-nextjs-auth
description: Implements Scalekit authentication in a Next.js App Router project using the patterns from scalekit-inc/scalekit-nextjs-auth-example. Handles login, OAuth callback, session management, token refresh, logout, and permission-based access control using @scalekit-sdk/node. Use when adding auth routes, protecting pages, managing sessions, or checking permissions in a Next.js + Scalekit codebase.
---

# Scalekit Auth — Next.js App Router

Reference repo: [scalekit-inc/scalekit-nextjs-auth-example](https://github.com/scalekit-inc/scalekit-nextjs-auth-example)

## Project structure

```
app/api/auth/
├── login/route.ts       # GET — generates auth URL + sets CSRF state
├── callback/route.ts    # GET — exchanges code, sets session cookie
├── logout/route.ts      # POST — clears session, returns Scalekit logout URL
├── refresh/route.ts     # POST — refreshes access token, updates session
└── validate/route.ts    # Token validation endpoint

lib/
├── scalekit.ts          # Singleton ScalekitClient + default scopes
├── cookies.ts           # Session read/write/clear + OAuth state helpers
└── auth.ts              # isAuthenticated(), getCurrentUser(), hasPermission()
```

## Environment variables

```env
SCALEKIT_ENV_URL=https://your-env.scalekit.io
SCALEKIT_CLIENT_ID=your-client-id
SCALEKIT_CLIENT_SECRET=your-client-secret
SCALEKIT_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
SCALEKIT_SCOPES=openid profile email offline_access  # optional, space-separated
```

`SCALEKIT_REDIRECT_URI` must exactly match the allowed callback URL in the Scalekit dashboard.

## SDK client (`lib/scalekit.ts`)

Singleton pattern — always use `getScalekitClient()`, never instantiate directly. Throws if env vars are missing.

```ts
import { getScalekitClient, getDefaultScopes } from '@/lib/scalekit';

const client = getScalekitClient();
```

## Session shape (`lib/cookies.ts`)

Session stored as JSON in a single `scalekit_session` HttpOnly cookie:

```ts
interface SessionData {
  user: { sub, email, name, given_name, family_name, preferred_username };
  tokens: { access_token, refresh_token, id_token, expires_at, expires_in };
  roles?: string[];
  permissions?: string[];
}
```

Key helpers:
- `getSession()` — returns `SessionData | null`
- `setSession(data)` — writes HttpOnly cookie; expires = token `expires_at`
- `clearSession()` — deletes cookie (call on logout)
- `isTokenExpired(session)` — returns true if token expires within **5 minutes**
- `getOAuthState()` / `setOAuthState(state)` — CSRF state cookie, 10-min TTL
- Cookie config: `httpOnly: true`, `secure` in production, `sameSite: 'lax'`, `path: '/'`

## Auth flow

### Login (`app/api/auth/login/route.ts` — GET)

```ts
const state = crypto.randomBytes(32).toString('base64url');
await setOAuthState(state);
const authUrl = client.getAuthorizationUrl(redirectUri, { state, scopes: getDefaultScopes() });
return NextResponse.json({ authUrl });
```

### Callback (`app/api/auth/callback/route.ts` — GET)

1. Validate `state` param against stored `oauth_state` cookie → redirect to `/error` on mismatch
2. `clearOAuthState()`
3. `client.authenticateWithCode(code, redirectUri)` → `authResponse`
4. `client.validateToken(authResponse.accessToken)` → extract `roles`, `permissions`
   - Permission claims checked in order: `permissions` → `https://scalekit.com/permissions` → `scalekit:permissions`
5. Name resolution priority: `user.name` → `claims.name` → `givenName + familyName` → `email` → `preferred_username` → `'User'`
6. `setSession({ user, tokens, roles, permissions })`
7. Redirect to `/dashboard`

### Logout (`app/api/auth/logout/route.ts` — POST)

```ts
const logoutUrl = client.getLogoutUrl({
  idTokenHint: session.tokens.id_token,
  postLogoutRedirectUri: process.env.NEXT_PUBLIC_APP_URL,
});
await clearSession();
return NextResponse.json({ logoutUrl });
// Client receives logoutUrl and redirects
```

### Token refresh (`app/api/auth/refresh/route.ts` — POST)

```ts
const refreshResponse = await client.refreshAccessToken(session.tokens.refresh_token);
// Decode exp from JWT using jose.decodeJwt(); fallback to 3600s if missing
await setSession({ ...session, tokens: { ...session.tokens, access_token, refresh_token, expires_at, expires_in } });
```

## Auth utilities (`lib/auth.ts`)

```ts
isAuthenticated()          // → boolean (session exists)
getCurrentUser()           // → session.user | null
getAccessToken()           // → access_token string | null
hasPermission('read:data') // → validates token, checks permission claim
```

## Protecting routes

For Server Components, call auth helpers directly:

```ts
import { isAuthenticated, getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

const authenticated = await isAuthenticated();
if (!authenticated) redirect('/login');
const user = await getCurrentUser();
```

For permission-gated pages:

```ts
import { hasPermission } from '@/lib/auth';
const allowed = await hasPermission('org:admin');
if (!allowed) redirect('/permission-denied');
```

## Route map

| Route | Auth required |
|---|---|
| `/` | No |
| `/login` | No |
| `/auth/callback` | No |
| `/dashboard` | Yes |
| `/sessions` | Yes |
| `/organization/settings` | Yes + permission |
| `/permission-denied` | No |
| `/error` | No |

## Dependencies

```bash
npm install @scalekit-sdk/node jose date-fns js-cookie
```

## Tactics

### Edge middleware for route protection
Add `middleware.ts` at the project root to enforce auth before any Server Component renders:

```ts
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/dashboard', '/sessions', '/organization']

export function middleware(request: NextRequest) {
  const session = request.cookies.get('scalekit_session')
  const isProtected = PROTECTED_PATHS.some(p => request.nextUrl.pathname.startsWith(p))
  if (isProtected && !session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon).*)'],
}
```

Server Components should still call `isAuthenticated()` as a second layer.

### Triggering login from a Client Component
`/api/auth/login` returns `{ authUrl }` — never navigate there with `router.push`. OAuth requires a full page navigation:

```ts
const { authUrl } = await fetch('/api/auth/login').then(r => r.json())
window.location.href = authUrl  // full navigation, not client-side route change
```

### OIDC logout from the client
Logout returns `{ logoutUrl }` — the client must navigate to it:

```ts
const { logoutUrl } = await fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json())
window.location.href = logoutUrl  // navigates to Scalekit end-session endpoint
```
Local session is already cleared; this step revokes the IdP session so the user isn't silently re-authenticated on next login.

### Deep link preservation
In the login page, read `?next` from search params and carry it through the state:

```ts
// app/login/page.tsx
const next = searchParams.get('next') || '/dashboard'
// Pass next to /api/auth/login as a query param, store in session before redirect
// In /api/auth/callback: redirect to stored next URL after setSession()
```

Validate `next` on the server: only allow relative paths (`/...`) to prevent open redirect.

### SameSite=Lax — never Strict
The `scalekit_session` and `oauth_state` cookies must use `sameSite: 'lax'`. The OAuth callback is a cross-site redirect from Scalekit back to your app — `'strict'` drops the cookie on that redirect, causing a CSRF state mismatch error every time.

### Cache-Control: no-store on protected pages
Without this, the browser back button after logout serves a cached authenticated page:

```ts
// In a protected route handler or layout
export const dynamic = 'force-dynamic'

// Or explicitly in a route handler:
return new Response(html, {
  headers: { 'Cache-Control': 'no-store' },
})
```

### Token refresh race condition across tabs
Multiple browser tabs can simultaneously trigger token refresh with the same refresh token — most IdPs reject the second attempt. Mitigation: set a short-lived `refresh_in_progress` flag in the session before calling the refresh endpoint, and check it at the start of the refresh route to skip concurrent calls.
