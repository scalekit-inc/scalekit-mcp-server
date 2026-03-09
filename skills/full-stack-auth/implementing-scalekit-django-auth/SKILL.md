---
name: implementing-scalekit-django-auth
description: Implements Scalekit authentication in a Django project using the patterns from scalekit-inc/scalekit-django-auth-example. Handles login, OAuth callback, Django session storage, automatic token refresh via middleware, logout, and permission-based route protection using decorators. Use when adding auth views, protecting URLs, managing sessions, or checking permissions in a Django + Scalekit codebase.
---

# Scalekit Auth — Django

Reference repo: [scalekit-inc/scalekit-django-auth-example](https://github.com/scalekit-inc/scalekit-django-auth-example)

## Project structure

```
auth_app/
├── scalekit_client.py   # ScalekitClient class + scalekit_client() singleton
├── views.py             # All auth + protected views
├── decorators.py        # @login_required, @permission_required('perm:name')
├── middleware.py        # ScalekitTokenRefreshMiddleware (auto token refresh)
└── urls.py              # URL patterns (app_name = 'auth_app')

scalekit_django_auth/
└── settings.py          # SCALEKIT_* settings, middleware registration, session config
```

## Environment variables

```env
SCALEKIT_ENV_URL=https://your-env.scalekit.io
SCALEKIT_CLIENT_ID=your-client-id
SCALEKIT_CLIENT_SECRET=your-client-secret
SCALEKIT_REDIRECT_URI=http://localhost:8000/auth/callback
# SCALEKIT_SCOPES is set directly in settings.py, not from env
```

> `SCALEKIT_ENV_URL` also falls back to `SCALEKIT_DOMAIN` for backward compatibility.
> `SCALEKIT_REDIRECT_URI` has no trailing slash — this avoids Django redirect issues.

## Django settings (`settings.py`)

Key non-obvious settings to include:

```python
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.sessions',   # Required for session storage
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'auth_app',
]

MIDDLEWARE = [
    # ...
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'auth_app.middleware.ScalekitTokenRefreshMiddleware',  # MUST come after SessionMiddleware
    # ...
]

SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_AGE = 3600
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_SAVE_EVERY_REQUEST = True  # Required — ensures OAuth state persists across requests

SCALEKIT_ENV_URL = os.getenv('SCALEKIT_ENV_URL', os.getenv('SCALEKIT_DOMAIN', ''))
SCALEKIT_CLIENT_ID = os.getenv('SCALEKIT_CLIENT_ID', '')
SCALEKIT_CLIENT_SECRET = os.getenv('SCALEKIT_CLIENT_SECRET', '')
SCALEKIT_REDIRECT_URI = os.getenv('SCALEKIT_REDIRECT_URI', 'http://localhost:8000/auth/callback')
SCALEKIT_SCOPES = 'openid profile email offline_access'  # offline_access required for refresh token

LOGIN_URL = '/login'
```

## SDK client (`auth_app/scalekit_client.py`)

Lazy singleton — always use `scalekit_client()`, never instantiate directly:

```python
from auth_app.scalekit_client import scalekit_client

client = scalekit_client()  # raises ValueError with helpful message if env vars missing
```

SDK import paths:
```python
from scalekit import ScalekitClient as SDKClient
from scalekit.common.scalekit import (
    AuthorizationUrlOptions,
    CodeAuthenticationOptions,
    TokenValidationOptions,
    LogoutUrlOptions,
)
```

Key methods on `ScalekitClient`:

| Method | SDK call | Returns |
|---|---|---|
| `get_authorization_url(state)` | `sdk_client.get_authorization_url(redirect_uri, options)` | `str` URL |
| `exchange_code_for_tokens(code)` | `sdk_client.authenticate_with_code(code, redirect_uri, options)` | `dict` with `access_token`, `refresh_token`, `id_token`, `user`, `expires_in` |
| `get_user_info(access_token)` | `sdk_client.validate_access_token_and_get_claims(token, options)` | `dict` claims |
| `refresh_access_token(refresh_token)` | `sdk_client.refresh_access_token(refresh_token)` | `dict` with `access_token`, `refresh_token` |
| `validate_token_and_get_claims(token)` | `sdk_client.validate_access_token_and_get_claims(token, options)` | `dict` claims |
| `has_permission(access_token, permission)` | validates claims, checks permission key chain | `bool` |
| `logout(access_token, id_token)` | `sdk_client.get_logout_url(options)` | `str` URL |

## Session storage schema

All auth state is stored in Django's session (no extra DB tables):

```python
request.session['scalekit_user'] = {
    'sub', 'email', 'name', 'given_name', 'family_name',
    'preferred_username', 'claims'  # full access token claims dict
}
request.session['scalekit_tokens'] = {
    'access_token', 'refresh_token', 'id_token',
    'expires_at',   # ISO 8601 string (timezone-aware)
    'expires_in'    # int seconds
}
request.session['scalekit_roles'] = []        # from access token claims
request.session['scalekit_permissions'] = []  # from access token claims
```

Check authentication anywhere: `request.session.get('scalekit_user')` → truthy if logged in.

## Auth flow

### Login (`login_view` — GET `/login/`)

```python
state = secrets.token_urlsafe(32)
request.session['oauth_state'] = state
request.session.save()  # Explicit save — required for state to survive redirect
auth_url = client.get_authorization_url(state=state)
# Pass auth_url to template; user clicks it to redirect to Scalekit
```

### Callback (`callback_view` — GET `/auth/callback`)

1. Validate `state` param vs `request.session['oauth_state']` → render error on mismatch
2. `request.session.pop('oauth_state', None)`
3. `token_response = client.exchange_code_for_tokens(code)`
4. `user_obj = token_response.get('user', {})` — camelCase fields (`givenName`, `familyName`, `id`)
5. `user_info = client.get_user_info(access_token)` — snake_case claims for roles/permissions
6. Name resolution: `user_obj.name` → `givenName + familyName` → `user_info claims` → `email`
7. `expires_at = timezone.now() + timedelta(seconds=expires_in)`
8. Write `scalekit_user`, `scalekit_tokens`, `scalekit_roles`, `scalekit_permissions` to session
9. Redirect to `auth_app:dashboard`

Permission claim fallback chain (same as Node SDK):
```python
permissions = (
    claims.get('permissions', []) or
    claims.get('https://scalekit.com/permissions', []) or
    claims.get('scalekit:permissions', []) or
    []
)
```

### Logout (`logout_view` — GET `/logout/`)

```python
logout_url = client.logout(access_token, id_token)
# post_logout_redirect_uri = SCALEKIT_REDIRECT_URI.replace('/auth/callback', '')
request.session.flush()     # Wipes entire session
return redirect(logout_url) # Server-side redirect (not JSON like Next.js)
```

### Token refresh — middleware (`auth_app/middleware.py`)

`ScalekitTokenRefreshMiddleware` runs on every request. Skipped paths:
`/login`, `/auth/callback`, `/logout`, `/static/`, `/sessions/refresh-token`

Buffer: **1 minute** (vs 5 min in client `is_token_expired` helper).

Also available as a manual API endpoint: `POST /sessions/refresh-token/` → `JsonResponse`.

## Protecting views

```python
from auth_app.decorators import login_required, permission_required

@login_required
def dashboard_view(request): ...         # Redirects to /login?next=<path> if unauthenticated

@permission_required('organization:settings')
def org_settings_view(request): ...      # Renders permission_denied.html with 403 if missing
```

## URL configuration

```python
# auth_app/urls.py — app_name = 'auth_app'
path('auth/callback', callback_view, name='callback'),  # No trailing slash — intentional
path('sessions/validate-token/', validate_token_view),   # POST only
path('sessions/refresh-token/', refresh_token_view),     # POST only
```

Use `reverse('auth_app:dashboard')` / `{% url 'auth_app:login' %}` in templates.

## Route map

| URL | Auth | Notes |
|---|---|---|
| `/` | No | Redirects to dashboard if already logged in |
| `/login/` | No | Generates auth URL, stores CSRF state |
| `/auth/callback` | No | No trailing slash |
| `/dashboard/` | `@login_required` | |
| `/logout/` | `@login_required` | |
| `/sessions/` | `@login_required` | |
| `/sessions/validate-token/` | `@login_required` | POST |
| `/sessions/refresh-token/` | `@login_required` | POST |
| `/organization/settings/` | `@permission_required('organization:settings')` | |

## Install

```bash
pip install scalekit python-dotenv django
python manage.py migrate   # Creates session table (db.sqlite3, zero-config)
python manage.py runserver
```

## Tactics

### SameSite=Lax — never Strict
`SESSION_COOKIE_SAMESITE = 'Lax'` is correct. Do not change to `'Strict'` — it drops the session cookie on the cross-origin redirect from Scalekit back to `/auth/callback`, so `oauth_state` is unavailable and the CSRF check fails on every login.

### SESSION_SAVE_EVERY_REQUEST = True — why it matters
The OAuth flow involves at least two redirects. Without `SESSION_SAVE_EVERY_REQUEST = True`, the session containing `oauth_state` may not be written to the database before Django redirects to Scalekit, causing a state mismatch on the callback. This setting ensures session writes happen on every response.

### @csrf_exempt on the callback view
The OAuth callback receives a GET request from Scalekit (an external origin). Django's CSRF middleware does not block GETs, but the OAuth `state` parameter already serves as the CSRF token for this flow. If you ever add a POST-based callback, exempt it explicitly:

```python
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def callback_view(request): ...
```

### Deep link preservation
`@login_required` already appends `?next=<path>` when redirecting. Read it in `login_view` and restore it after a successful callback:

```python
# In login_view
next_url = request.GET.get('next', reverse('auth_app:dashboard'))
request.session['next'] = next_url
request.session.save()  # explicit save before redirect

# In callback_view — after writing session data
next_url = request.session.pop('next', reverse('auth_app:dashboard'))
if not next_url.startswith('/'):        # prevent open redirect
    next_url = reverse('auth_app:dashboard')
return redirect(next_url)
```

### Cache-Control: no-store on protected views
Without this, the back button after logout serves a cached authenticated page:

```python
from django.views.decorators.cache import never_cache

@never_cache
@login_required
def dashboard_view(request): ...
```

### AJAX: 401 instead of redirect
If your frontend makes AJAX calls to protected views, return `401` instead of a redirect:

```python
from functools import wraps
from django.http import JsonResponse

def login_required_ajax(f):
    @wraps(f)
    def decorated(request, *args, **kwargs):
        if not request.session.get('scalekit_user'):
            if request.headers.get('Accept') == 'application/json':
                return JsonResponse({'error': 'Authentication required'}, status=401)
            return redirect(f"{reverse('auth_app:login')}?next={request.path}")
        return f(request, *args, **kwargs)
    return decorated
```

### Session fixation after login
Call `request.session.cycle_key()` immediately after writing session data in `callback_view` to prevent session fixation — an attacker who planted a known session ID before login cannot hijack the authenticated session:

```python
# At the end of callback_view, after writing all session keys:
request.session.cycle_key()
return redirect(next_url)
```
