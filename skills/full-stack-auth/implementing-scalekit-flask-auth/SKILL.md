---
name: implementing-scalekit-flask-auth
description: Guides implementation of Scalekit OIDC/OAuth2 authentication and authorization in an existing Flask project. Use when the user wants to add Scalekit login, SSO, token management, session handling, or permission-based route protection to a Flask app. Triggers on: "add scalekit", "scalekit auth", "scalekit login", "scalekit SSO", "scalekit flask", "protect flask routes with scalekit".
---

# Scalekit Auth for Flask

Reference implementation: [scalekit-inc/scalekit-flask-auth-example](https://github.com/scalekit-inc/scalekit-flask-auth-example)

## Step 1 — Install dependencies

```bash
pip install scalekit-sdk python-dotenv flask
```

Add to `requirements.txt`:
```
scalekit-sdk>=0.1.0
python-dotenv
flask
```

---

## Step 2 — Environment variables

Create `.env` (never commit this):

```env
SCALEKIT_ENV_URL=https://your-env.scalekit.com
SCALEKIT_CLIENT_ID=your_client_id
SCALEKIT_CLIENT_SECRET=your_client_secret
SCALEKIT_REDIRECT_URI=http://localhost:5000/auth/callback
FLASK_SECRET_KEY=change-me-in-production
DEBUG=True
```

> `offline_access` scope is included by default in the config below. It is required to receive a `refresh_token`.

---

## Step 3 — App factory (`app.py`)

Use Flask's application factory pattern. All Scalekit config goes into `app.config` so that `current_app` is available inside request contexts.

```python
import os
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)

    # Flask session config
    app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'change-me')
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SECURE'] = False   # Set True in production (HTTPS)
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['PERMANENT_SESSION_LIFETIME'] = 3600

    # Scalekit config
    app.config['SCALEKIT_ENV_URL'] = os.getenv('SCALEKIT_ENV_URL', '')
    app.config['SCALEKIT_CLIENT_ID'] = os.getenv('SCALEKIT_CLIENT_ID', '')
    app.config['SCALEKIT_CLIENT_SECRET'] = os.getenv('SCALEKIT_CLIENT_SECRET', '')
    app.config['SCALEKIT_REDIRECT_URI'] = os.getenv('SCALEKIT_REDIRECT_URI', 'http://localhost:5000/auth/callback')
    app.config['SCALEKIT_SCOPES'] = 'openid profile email offline_access'

    # Register blueprint
    from auth_app.views import auth_bp
    app.register_blueprint(auth_bp)

    # Register token refresh middleware as a before_request hook
    from auth_app.middleware import TokenRefreshMiddleware
    app.before_request(TokenRefreshMiddleware.process_request)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=app.config['DEBUG'])
```

---

## Step 4 — Scalekit client wrapper (`auth_app/scalekit_client.py`)

**Important**: `ScalekitClient` reads from `current_app.config`, so it must always be instantiated inside an active Flask request context (i.e., inside a view or `before_request` hook).

```python
import logging
from datetime import datetime, timedelta
from flask import current_app
from scalekit import ScalekitClient as SDKClient
from scalekit.common.scalekit import (
    AuthorizationUrlOptions,
    CodeAuthenticationOptions,
    TokenValidationOptions,
    LogoutUrlOptions,
)

logger = logging.getLogger(__name__)


class ScalekitClient:
    def __init__(self):
        self.domain = current_app.config['SCALEKIT_ENV_URL']
        self.client_id = current_app.config['SCALEKIT_CLIENT_ID']
        self.client_secret = current_app.config['SCALEKIT_CLIENT_SECRET']
        self.redirect_uri = current_app.config['SCALEKIT_REDIRECT_URI']
        scopes = current_app.config.get('SCALEKIT_SCOPES', '')
        self.scopes = scopes.split() if scopes else ['openid', 'profile', 'email', 'offline_access']

        self.sdk_client = SDKClient(
            env_url=self.domain,
            client_id=self.client_id,
            client_secret=self.client_secret,
        )

    def get_authorization_url(self, state=None) -> str:
        options = AuthorizationUrlOptions()
        options.state = state
        options.scopes = self.scopes
        return self.sdk_client.get_authorization_url(redirect_uri=self.redirect_uri, options=options)

    def exchange_code_for_tokens(self, code: str) -> dict:
        options = CodeAuthenticationOptions()
        token_response = self.sdk_client.authenticate_with_code(
            code=code, redirect_uri=self.redirect_uri, options=options
        )
        token_response.setdefault('expires_in', 3600)
        return token_response

    def refresh_access_token(self, refresh_token: str) -> dict:
        token_response = self.sdk_client.refresh_access_token(refresh_token)
        token_response.setdefault('expires_in', 3600)
        if not token_response.get('refresh_token'):
            token_response['refresh_token'] = refresh_token
        return token_response

    def get_user_info(self, access_token: str) -> dict:
        options = TokenValidationOptions()
        claims = self.sdk_client.validate_access_token_and_get_claims(token=access_token, options=options)
        return claims if isinstance(claims, dict) else dict(claims)

    def validate_token_and_get_claims(self, access_token: str) -> dict:
        return self.get_user_info(access_token)

    def has_permission(self, access_token: str, permission: str) -> bool:
        try:
            claims = self.validate_token_and_get_claims(access_token)
            permissions = (
                claims.get('permissions', []) or
                claims.get('https://scalekit.com/permissions', []) or
                claims.get('scalekit:permissions', []) or
                []
            )
            return permission in permissions
        except Exception:
            return False

    def logout(self, access_token: str) -> str:
        try:
            options = LogoutUrlOptions()
            options.post_logout_redirect_uri = self.redirect_uri.split('/auth/callback')[0]
            return self.sdk_client.get_logout_url(options)
        except Exception:
            return f"{self.domain}/oidc/logout"
```

---

## Step 5 — Decorators (`auth_app/decorators.py`)

Flask uses decorators (not dependency injection) to protect routes.

```python
from functools import wraps
from flask import session, redirect, url_for, request, render_template
from auth_app.scalekit_client import ScalekitClient


def login_required(f):
    """Redirect to /login if user is not authenticated."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('scalekit_user'):
            return redirect(url_for('auth.login', next=request.path))
        return f(*args, **kwargs)
    return decorated


def permission_required(permission):
    """Return 403 if authenticated user lacks the specified permission."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not session.get('scalekit_user'):
                return redirect(url_for('auth.login', next=request.path))
            token_data = session.get('scalekit_tokens', {})
            access_token = token_data.get('access_token')
            if not access_token:
                return "No access token. Please log in again.", 403
            client = ScalekitClient()
            if not client.has_permission(access_token, permission):
                return render_template('permission_denied.html',
                                       user=session.get('scalekit_user', {})), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
```

---

## Step 6 — Token refresh middleware (`auth_app/middleware.py`)

Registered as a `before_request` hook. Auto-refreshes access tokens within 5 minutes of expiry. On `invalid_grant`, clears the session to force re-login.

```python
import logging
from datetime import datetime, timedelta
from flask import session, request
from auth_app.scalekit_client import ScalekitClient

logger = logging.getLogger(__name__)

REFRESH_BUFFER_MINUTES = 5
SKIP_PATHS = ['/login', '/auth/callback', '/logout', '/static/', '/sessions/refresh-token']


class TokenRefreshMiddleware:
    @staticmethod
    def process_request():
        if not session.get('scalekit_user'):
            return None
        if any(request.path.startswith(p) for p in SKIP_PATHS):
            return None

        token_data = session.get('scalekit_tokens', {})
        expires_at_str = token_data.get('expires_at')
        refresh_token = token_data.get('refresh_token')

        if not expires_at_str or not refresh_token:
            return None

        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            if expires_at.tzinfo:
                expires_at = expires_at.replace(tzinfo=None)

            if datetime.utcnow() + timedelta(minutes=REFRESH_BUFFER_MINUTES) >= expires_at:
                client = ScalekitClient()
                token_response = client.refresh_access_token(refresh_token)
                expires_in = token_response.get('expires_in', 3600)
                session['scalekit_tokens'] = {
                    'access_token': token_response.get('access_token'),
                    'refresh_token': token_response.get('refresh_token', refresh_token),
                    'id_token': token_response.get('id_token', token_data.get('id_token')),
                    'expires_at': (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
                    'expires_in': expires_in,
                }
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            if 'invalid_grant' in str(e):
                logger.warning("Refresh token revoked — clearing session")
                session.clear()

        return None
```

---

## Step 7 — Auth views (`auth_app/views.py`)

```python
import secrets
import base64
import json
import logging
from datetime import datetime, timedelta
from flask import Blueprint, render_template, redirect, url_for, request, session, jsonify
from auth_app.scalekit_client import ScalekitClient
from auth_app.decorators import login_required, permission_required

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login')
def login():
    if session.get('scalekit_user'):
        return redirect(url_for('auth.dashboard'))
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    client = ScalekitClient()
    auth_url = client.get_authorization_url(state=state)
    # Render a login template that links to auth_url, or redirect directly:
    return redirect(auth_url)


@auth_bp.route('/auth/callback')
def callback():
    # CSRF check
    state = request.args.get('state')
    if not state or state != session.pop('oauth_state', None):
        return render_template('error.html', error='Invalid state. Enable cookies and try again.'), 400

    code = request.args.get('code')
    error = request.args.get('error')
    if error or not code:
        return render_template('error.html', error=f'Auth error: {error or "no code"}'), 400

    try:
        client = ScalekitClient()
        token_response = client.exchange_code_for_tokens(code)

        access_token = token_response.get('access_token')
        refresh_token = token_response.get('refresh_token')
        id_token = token_response.get('id_token')
        expires_in = token_response.get('expires_in', 3600)

        # Decode ID token for user profile (primary source)
        id_token_claims = {}
        if id_token:
            try:
                payload = id_token.split('.')[1]
                payload += '=' * (4 - len(payload) % 4)
                id_token_claims = json.loads(base64.urlsafe_b64decode(payload))
            except Exception:
                pass

        # Get user info from access token (for roles/permissions)
        user_info = {}
        try:
            user_info = client.get_user_info(access_token)
        except Exception as e:
            logger.warning(f"Could not get user info: {e}")

        # Merge: access token claims first, then ID token claims override profile fields
        merged = {**user_info, **id_token_claims}

        session['scalekit_user'] = {
            'sub': merged.get('sub'),
            'email': merged.get('email'),
            'name': merged.get('name'),
            'given_name': merged.get('given_name'),
            'family_name': merged.get('family_name'),
            'preferred_username': merged.get('preferred_username'),
            'claims': merged,
        }
        session['scalekit_tokens'] = {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'id_token': id_token,
            'expires_at': (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            'expires_in': expires_in,
        }
        session['scalekit_roles'] = user_info.get('roles', []) or user_info.get('https://scalekit.com/roles', [])
        session['scalekit_permissions'] = (
            user_info.get('permissions', []) or user_info.get('https://scalekit.com/permissions', [])
        )
        session.permanent = True

        return redirect(url_for('auth.dashboard'))

    except Exception as e:
        logger.error(f"Auth error: {e}")
        return render_template('error.html', error=str(e)), 500


@auth_bp.route('/logout', methods=['GET', 'POST'])
@login_required
def logout():
    token_data = session.get('scalekit_tokens', {})
    access_token = token_data.get('access_token')
    session.clear()
    if access_token:
        try:
            logout_url = ScalekitClient().logout(access_token)
            return redirect(logout_url)
        except Exception:
            pass
    return redirect(url_for('auth.home'))


# --- Example: protected route ---
@auth_bp.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', user=session.get('scalekit_user', {}))


# --- Example: permission-gated route ---
@auth_bp.route('/organization/settings')
@permission_required('organization:settings')
def organization_settings():
    return render_template('organization_settings.html', user=session.get('scalekit_user', {}))


# --- API: manual token refresh ---
@auth_bp.route('/sessions/refresh-token', methods=['POST'])
@login_required
def refresh_token():
    token_data = session.get('scalekit_tokens', {})
    rt = token_data.get('refresh_token')
    if not rt:
        return jsonify({'success': False, 'error': 'No refresh token. Request offline_access scope.'}), 400
    try:
        client = ScalekitClient()
        resp = client.refresh_access_token(rt)
        expires_in = resp.get('expires_in', 3600)
        session['scalekit_tokens'] = {
            'access_token': resp.get('access_token'),
            'refresh_token': resp.get('refresh_token', rt),
            'id_token': resp.get('id_token', token_data.get('id_token')),
            'expires_at': (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            'expires_in': expires_in,
        }
        return jsonify({'success': True, 'newAccessToken': resp.get('access_token')})
    except Exception as e:
        if 'invalid_grant' in str(e):
            session.clear()
            return jsonify({'success': False, 'error': 'Refresh token expired. Re-login required.', 'requiresReauth': True}), 401
        return jsonify({'success': False, 'error': str(e)})
```

---

## Key differences from FastAPI

| | Flask | FastAPI |
|---|---|---|
| Route protection | `@login_required` decorator | `Depends(require_login)` |
| Permission check | `@permission_required('x')` decorator | `Depends(require_permission('x'))` |
| Middleware hook | `app.before_request(...)` | `app.add_middleware(...)` |
| Config access | `current_app.config` (request context) | `settings` singleton (module level) |
| Session import | `from flask import session` | `request.session` attribute |
| Claims source | ID token + access token merged | Access token / `user` object from SDK |
| Refresh token error | Clears session on `invalid_grant` | Logs error, lets next request retry |

---

## Session data structure

| Key | Contents |
|---|---|
| `scalekit_user` | `sub`, `email`, `name`, `given_name`, `family_name`, `preferred_username`, `claims` |
| `scalekit_tokens` | `access_token`, `refresh_token`, `id_token`, `expires_at`, `expires_in` |
| `scalekit_roles` | `["admin", ...]` |
| `scalekit_permissions` | `["organization:settings", ...]` |

---

## Common patterns

**Read current user in any view:**
```python
from flask import session
user = session.get('scalekit_user', {})
```

**Check permission ad-hoc:**
```python
client = ScalekitClient()
if client.has_permission(session['scalekit_tokens']['access_token'], 'reports:read'):
    ...
```

**Decode JWT claims without verification:**
```python
import base64, json
payload = access_token.split('.')[1]
payload += '=' * (4 - len(payload) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload))
```

---

## Checklist

- [ ] `.env` populated with all 5 Scalekit env vars
- [ ] `SCALEKIT_REDIRECT_URI` matches the URI registered in Scalekit dashboard
- [ ] `offline_access` in `SCALEKIT_SCOPES` (required for `refresh_token`)
- [ ] `before_request` hook registered in `create_app()` — not on the module level
- [ ] `ScalekitClient()` instantiated only inside request contexts (views, hooks)
- [ ] `SESSION_COOKIE_SECURE = True` in production (HTTPS only)
- [ ] `FLASK_SECRET_KEY` is a strong random string in production
- [ ] CSRF `state` check present in `/auth/callback`
- [ ] `invalid_grant` handling in token refresh clears session

## Tactics

### SameSite=Lax — never Strict
`SESSION_COOKIE_SAMESITE = 'Lax'` is correct. Do not change to `'Strict'` — the OAuth callback is a cross-origin redirect from Scalekit back to `/auth/callback`. `'Strict'` drops the session cookie on that redirect, making `oauth_state` unavailable and causing the CSRF check to fail on every login.

### CORS for JavaScript clients
If a JavaScript frontend calls the Flask backend:

```bash
pip install flask-cors
```

```python
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app,
         origins=["http://localhost:3000"],  # explicit origin required
         supports_credentials=True)          # required for session cookies
    ...
```

> ⚠️ `origins="*"` does not work with `supports_credentials=True`. Always specify explicit origins.

### Deep link preservation

```python
@auth_bp.route('/login')
def login():
    next_url = request.args.get('next', url_for('auth.dashboard'))
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    session['next'] = next_url   # preserve intended URL
    ...

@auth_bp.route('/auth/callback')
def callback():
    ...
    next_url = session.pop('next', url_for('auth.dashboard'))
    if not next_url.startswith('/'):  # prevent open redirect
        next_url = url_for('auth.dashboard')
    return redirect(next_url)
```

The `@login_required` decorator passes `?next=<path>` automatically — read it in `login()`.

### Cache-Control: no-store on protected responses

```python
from flask import make_response

@auth_bp.route('/dashboard')
@login_required
def dashboard():
    resp = make_response(render_template('dashboard.html', user=session.get('scalekit_user', {})))
    resp.headers['Cache-Control'] = 'no-store'
    return resp
```

Prevents the browser from serving a cached authenticated page after logout via the back button.

### AJAX: 401 instead of redirect
Update `@login_required` to return `401` for JSON requests:

```python
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('scalekit_user'):
            if request.headers.get('Accept') == 'application/json':
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(url_for('auth.login', next=request.path))
        return f(*args, **kwargs)
    return decorated
```

### Session fixation after login
Flask does not regenerate the session ID automatically. Call `session.modified = True` and use `flask.session` with a new session cookie after login. For a stronger fix, clear and re-create the session immediately after writing user data in `callback()`:

```python
# After storing user/token data, regenerate session to prevent fixation:
user_data = session.get('scalekit_user')
token_data = session.get('scalekit_tokens')
session.clear()
session['scalekit_user'] = user_data
session['scalekit_tokens'] = token_data
session.permanent = True
```

### Production: Secure cookie flag
```python
app.config['SESSION_COOKIE_SECURE'] = not app.debug  # True in production (HTTPS)
```
