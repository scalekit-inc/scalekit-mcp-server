---
name: implementing-scalekit-laravel-auth
description: Implements Scalekit authentication in a Laravel app using the patterns from scalekit-inc/scalekit-laravel-auth-example. Handles login, OAuth callback, Laravel session storage, automatic token refresh via middleware, logout, and permission-based route protection. Uniquely uses Laravel's Http facade with raw HTTP calls instead of a PHP SDK — no official Scalekit PHP SDK exists. Use when adding auth controllers, protecting routes with middleware, managing sessions, or checking permissions in a Laravel + Scalekit codebase.
---

# Scalekit Auth — Laravel

Reference repo: [scalekit-inc/scalekit-laravel-auth-example](https://github.com/scalekit-inc/scalekit-laravel-auth-example)

## Project structure

```
app/
├── Services/
│   └── ScalekitClient.php          # Raw HTTP OAuth client (no PHP SDK)
├── Http/
│   ├── Controllers/
│   │   └── AuthController.php
│   └── Middleware/
│       ├── ScalekitAuth.php         # Session auth gate
│       ├── ScalekitPermission.php   # Per-route permission check
│       └── ScalekitTokenRefresh.php # Auto token refresh on every request

config/
└── scalekit.php                    # Reads from env via config('scalekit.*')

routes/
└── web.php                         # Named routes + middleware groups
```

## Environment variables

```env
SCALEKIT_ENV_URL=https://your-env.scalekit.io
SCALEKIT_CLIENT_ID=your-client-id
SCALEKIT_CLIENT_SECRET=your-client-secret
SCALEKIT_REDIRECT_URI=http://localhost:8000/auth/callback
```

Scopes are hardcoded in `config/scalekit.php`, not from env:
```php
'scopes' => 'openid profile email offline_access',
// offline_access is required to receive a refresh token
```

## `ScalekitClient` service (`app/Services/ScalekitClient.php`)

> ⚠️ No official Scalekit PHP SDK exists. This app uses **Laravel's `Http` facade** with raw HTTP calls. Always use `config('scalekit.*')` — do not read `env()` directly:

```php
use App\Services\ScalekitClient;
// Injected via Laravel's service container — never `new ScalekitClient()`
```

### Key methods and their HTTP calls

| Method | HTTP call | Auth |
|---|---|---|
| `getAuthorizationUrl($state)` | Builds `{env_url}/oauth/authorize?response_type=code&...` | None |
| `exchangeCodeForTokens($code)` | `POST {env_url}/oauth/token` with `grant_type=authorization_code` | Basic Auth |
| `refreshAccessToken($refreshToken)` | `POST {env_url}/oauth/token` with `grant_type=refresh_token` | Basic Auth |
| `getUserInfo($accessToken)` | Delegates to `validateTokenAndGetClaims()` | — |
| `validateTokenAndGetClaims($token)` | **Manual base64 JWT decode** — no signature verification | — |
| `hasPermission($token, $permission)` | Decodes JWT, checks permission claim chain | — |
| `logout($accessToken)` | Builds `{env_url}/oidc/logout?post_logout_redirect_uri=...` | None |
| `isTokenExpired($expiresAt)` | `now()->addMinutes(5)->gt(Carbon::parse($expiresAt))` | — |

Token exchange and refresh use `Http::asForm()->withBasicAuth(clientId, clientSecret)`. Both fall back to `expires_in = 3600` if the field is missing.

### JWT decode pattern (used in both token validation and ID token decode)

```php
$parts = explode('.', $token);
$payload = $parts[1];
$payload .= str_repeat('=', (4 - strlen($payload) % 4) % 4); // padding
$decoded = base64_decode(strtr($payload, '-_', '+/'));         // URL-safe base64
$claims = json_decode($decoded, true);
```

### Permission claim fallback chain

```php
$permissions = $claims['permissions']
    ?? $claims['https://scalekit.com/permissions']
    ?? $claims['scalekit:permissions']
    ?? [];

// Also falls back to scope string if all are empty
if (empty($permissions)) {
    $permissions = explode(' ', $claims['scope'] ?? '');
}
```

## Session storage schema

All auth state lives in Laravel's session — no extra DB tables (uses default `database` or `file` driver):

```php
session([
    'scalekit_user' => [
        'sub', 'email', 'name', 'given_name', 'family_name',
        'preferred_username',
        'claims'  // merged array of ALL claims (ID token overlaid on access token)
    ],
    'scalekit_tokens' => [
        'access_token', 'refresh_token', 'id_token',
        'expires_at',  // Carbon ISO 8601 string via ->toIso8601String()
        'expires_in',  // int seconds
    ],
    'scalekit_roles'       => [],  // from access token claims
    'scalekit_permissions' => [],  // from access token claims
]);
```

Check auth status anywhere: `session()->has('scalekit_user')`.

## Auth flow

### Login (`GET /login` → `AuthController::login`)

```php
$state = Str::random(32);           // Illuminate\Support\Str
session(['oauth_state' => $state]);
$authUrl = $this->scalekitClient->getAuthorizationUrl($state);
return view('auth.login', ['auth_url' => $authUrl]);
// Template renders a link/button to $auth_url
```

### Callback (`GET /auth/callback` → `AuthController::callback`)

1. Validate `$request->query('state')` vs `session('oauth_state')` → `response()->view('auth.error', [...], 400)` on mismatch
2. `session()->forget('oauth_state')`
3. `$tokenResponse = $this->scalekitClient->exchangeCodeForTokens($code)`
4. **Manually decode ID token** → `$idTokenClaims`
5. `$userInfo = $this->scalekitClient->getUserInfo($accessToken)` → access token claims
6. **Merge**: `$mergedClaims = array_merge($userInfo, $idTokenClaims)` — ID token wins (overlaid last)
7. `$expiresAt = now()->addSeconds($expiresIn)`
8. Write all four session keys
9. `return redirect()->route('auth.dashboard')`

### Logout (`GET|POST /logout` → `AuthController::logout`)

```php
$logoutUrl = $this->scalekitClient->logout($accessToken);
// → {env_url}/oidc/logout?post_logout_redirect_uri={base_url}
// post_logout_redirect_uri is derived from SCALEKIT_REDIRECT_URI, stripping /auth/callback

session()->flush();           // Full session wipe
return redirect($logoutUrl);  // Server-side redirect to Scalekit
```

### Token refresh — controller (`POST /sessions/refresh-token`)

On `invalid_grant` error: `session()->flush()` + return `401` with `'requiresReauth' => true`.

## Middleware

### Registration in `bootstrap/app.php` (Laravel 11) or `Kernel.php` (Laravel ≤10)

```php
// Laravel 11 — bootstrap/app.php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'scalekit.auth'       => \App\Http\Middleware\ScalekitAuth::class,
        'scalekit.permission' => \App\Http\Middleware\ScalekitPermission::class,
    ]);
    $middleware->append(\App\Http\Middleware\ScalekitTokenRefresh::class);
})
```

### `ScalekitAuth` — session gate

Redirects to `auth.login` with `->with('next', $request->path())` if `scalekit_user` session key is missing.

### `ScalekitPermission` — parameterised permission check

Validates access token claims via `ScalekitClient::hasPermission()`. On failure: `response()->view('auth.permission_denied', [...], 403)`. Never returns a JSON 403 — always renders a view.

### `ScalekitTokenRefresh` — auto refresh on every request

Skipped paths: `login`, `auth/callback`, `logout`, `sessions/refresh-token`.

Buffer: **5 minutes** (via `isTokenExpired()`). On `invalid_grant` during auto-refresh: `session()->flush()` (user gets redirected on next request).

## Routes (`routes/web.php`)

```php
// Public
Route::get('/', [AuthController::class, 'home'])->name('auth.home');
Route::get('/login', [AuthController::class, 'login'])->name('auth.login');
Route::get('/auth/callback', [AuthController::class, 'callback'])->name('auth.callback');

// Protected group
Route::middleware(['scalekit.auth'])->group(function () {
    Route::get('/dashboard', [AuthController::class, 'dashboard'])->name('auth.dashboard');
    Route::match(['get', 'post'], '/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('/sessions', [AuthController::class, 'sessions'])->name('auth.sessions');
    Route::post('/sessions/validate-token', [AuthController::class, 'validateToken'])->name('auth.validate_token');
    Route::post('/sessions/refresh-token', [AuthController::class, 'refreshToken'])->name('auth.refresh_token');

    // Permission-gated — note colon syntax for middleware parameter
    Route::get('/organization/settings', [AuthController::class, 'organizationSettings'])
        ->middleware('scalekit.permission:organization:settings')
        ->name('auth.organization_settings');
});
```

Key notes:
- Logout accepts both `GET` and `POST` (`Route::match`)
- Permission middleware receives the permission name as a colon-separated parameter
- Named routes use `auth.` prefix throughout — use `route('auth.dashboard')` in Blade

## Route map

| URL | Middleware | Auth |
|---|---|---|
| `GET /` | — | No |
| `GET /login` | — | No |
| `GET /auth/callback` | — | No |
| `GET /dashboard` | `scalekit.auth` | Yes |
| `GET\|POST /logout` | `scalekit.auth` | Yes |
| `GET /sessions` | `scalekit.auth` | Yes |
| `POST /sessions/validate-token` | `scalekit.auth` | Yes |
| `POST /sessions/refresh-token` | `scalekit.auth` | Yes |
| `GET /organization/settings` | `scalekit.auth` + `scalekit.permission:organization:settings` | Yes + permission |

## Dependency injection

`ScalekitClient` is resolved from Laravel's service container in every controller and middleware constructor. No singleton binding needed — Laravel resolves it fresh per request by default. Register it in `AppServiceProvider` only if you need to scope it as a singleton:

```php
// Optional — only if you want to share a single instance
$this->app->singleton(ScalekitClient::class);
```

## Install

```bash
composer require firebase/php-jwt  # Only if using JWT signature verification
php artisan key:generate
php artisan migrate                 # Creates sessions table if using database driver
php artisan serve
```

Copy `.env.example` to `.env` and fill in the four `SCALEKIT_*` values.

## Tactics

### SameSite=Lax — required for OAuth callbacks
Verify your session cookie config in `config/session.php`:

```php
'same_site' => 'lax',   // Required — 'strict' breaks OAuth callbacks
'secure'    => env('SESSION_SECURE_COOKIE', false),  // true in production
'http_only' => true,
```

`SameSite: strict` drops the session cookie on the cross-origin redirect from Scalekit back to `/auth/callback`, making `oauth_state` unavailable and causing the state mismatch check to fail every time.

### CSRF exclusion for the OAuth callback
The OAuth callback is a GET request and is not subject to Laravel's CSRF middleware. However, if you add any Scalekit webhook endpoints (POST), exclude them explicitly. In Laravel 11 (`bootstrap/app.php`):

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->validateCsrfTokens(except: [
        'webhooks/scalekit',   // example — callback is GET, not needed here
    ]);
})
```

### Deep link preservation

```php
// In AuthController::login
$next = $request->query('next', route('auth.dashboard'));
// Validate: only relative paths
if (!str_starts_with($next, '/')) {
    $next = route('auth.dashboard');
}
session(['oauth_state' => $state, 'next' => $next]);

// In AuthController::callback — after writing session data
$next = session()->pull('next', route('auth.dashboard'));
if (!str_starts_with($next, '/')) {
    $next = route('auth.dashboard');
}
return redirect($next);
```

`ScalekitAuth` middleware passes `->with('next', $request->path())` when redirecting to login — read it back in `login()` with `session('next')` or `$request->query('next')`.

### Cache-Control: no-store on protected responses

```php
return response()
    ->view('auth.dashboard', ['user' => session('scalekit_user', [])])
    ->header('Cache-Control', 'no-store');
```

Prevents the browser back button from serving a cached authenticated page after logout.

### AJAX: 401 instead of redirect
Update `ScalekitAuth` middleware to return `401` for JSON requests:

```php
public function handle(Request $request, Closure $next): Response
{
    if (!session()->has('scalekit_user')) {
        if ($request->expectsJson()) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }
        return redirect()->route('auth.login')->with('next', $request->path());
    }
    return $next($request);
}
```

### CORS for JavaScript clients
Laravel ships with CORS support. In `config/cors.php`:

```php
'paths'               => ['api/*', 'auth/*', 'sessions/*'],
'allowed_origins'     => ['http://localhost:3000'],   // explicit origin required
'supports_credentials' => true,   // required for session cookies
```

> ⚠️ `'allowed_origins' => ['*']` does not work with `supports_credentials => true`.

### Session fixation after login
After writing all session data in `callback()`, regenerate the session ID to prevent session fixation:

```php
// At the end of AuthController::callback, after writing session data:
session()->regenerate();
return redirect($next);
```

`session()->regenerate()` issues a new session ID while preserving the session data — an attacker who set a known session ID before login cannot use it after authentication.
