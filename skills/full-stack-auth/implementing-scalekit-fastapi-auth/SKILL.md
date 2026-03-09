---
name: implementing-scalekit-fastapi-auth
description: Guides implementation of Scalekit OIDC/OAuth2 authentication and authorization in an existing FastAPI project. Use when the user wants to add Scalekit login, SSO, token management, session handling, or permission-based route protection to a FastAPI app. Triggers on: "add scalekit", "scalekit auth", "scalekit login", "scalekit SSO", "scalekit fastapi", "protect routes with scalekit".
---

# Scalekit Auth for FastAPI

Reference implementation: [scalekit-inc/scalekit-fastapi-auth-example](https://github.com/scalekit-inc/scalekit-fastapi-auth-example)

## Step 1 — Install dependencies

```bash
pip install scalekit-sdk python-dotenv pydantic-settings starlette
```

Add to `requirements.txt`:
```
scalekit-sdk>=0.1.0
python-dotenv
pydantic-settings
starlette
```

---

## Step 2 — Environment variables

Create `.env` (never commit this):

```env
SCALEKIT_ENV_URL=https://your-env.scalekit.com
SCALEKIT_CLIENT_ID=your_client_id
SCALEKIT_CLIENT_SECRET=your_client_secret
SCALEKIT_REDIRECT_URI=http://localhost:8000/auth/callback
SCALEKIT_SCOPES=openid profile email offline_access
SECRET_KEY=change-me-in-production
DEBUG=True
```

> `offline_access` scope is required to receive a `refresh_token`.

---

## Step 3 — Config (`app/config.py`)

```python
import os
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    scalekit_env_url: str = os.getenv('SCALEKIT_ENV_URL', '')
    scalekit_client_id: str = os.getenv('SCALEKIT_CLIENT_ID', '')
    scalekit_client_secret: str = os.getenv('SCALEKIT_CLIENT_SECRET', '')
    scalekit_redirect_uri: str = os.getenv('SCALEKIT_REDIRECT_URI', 'http://localhost:8000/auth/callback')
    scalekit_scopes: List[str] = os.getenv('SCALEKIT_SCOPES', 'openid profile email offline_access').split()
    debug: bool = os.getenv('DEBUG', 'True') == 'True'
    secret_key: str = os.getenv('SECRET_KEY', 'change-me')
    session_max_age: int = 3600

settings = Settings()
```

---

## Step 4 — Scalekit client wrapper (`app/scalekit_client.py`)

```python
import logging
from functools import lru_cache
from scalekit import ScalekitClient as _ScalekitClient
from app.config import settings

logger = logging.getLogger(__name__)

class ScalekitClientWrapper:
    def __init__(self):
        self._client = _ScalekitClient(
            env_url=settings.scalekit_env_url,
            client_id=settings.scalekit_client_id,
            client_secret=settings.scalekit_client_secret,
        )

    def get_authorization_url(self, state: str) -> str:
        return self._client.get_authorization_url(
            redirect_uri=settings.scalekit_redirect_uri,
            scopes=settings.scalekit_scopes,
            state=state,
        )

    def exchange_code_for_tokens(self, code: str) -> dict:
        return self._client.authenticate_with_code(
            code=code,
            redirect_uri=settings.scalekit_redirect_uri,
        )

    def get_user_info(self, access_token: str) -> dict:
        return self._client.get_user_info(access_token)

    def validate_token_and_get_claims(self, access_token: str) -> dict:
        return self._client.validate_access_token(access_token)

    def refresh_access_token(self, refresh_token: str) -> dict:
        return self._client.refresh_token(refresh_token)

    def has_permission(self, access_token: str, permission: str) -> bool:
        try:
            claims = self.validate_token_and_get_claims(access_token)
            permissions = (
                claims.get('permissions', []) or
                claims.get('https://scalekit.com/permissions', [])
            )
            return permission in permissions
        except Exception:
            return False

    def logout(self, access_token: str) -> str:
        return self._client.get_logout_url(
            access_token=access_token,
            post_logout_redirect_uri=settings.scalekit_redirect_uri.replace('/auth/callback', '/'),
        )

@lru_cache(maxsize=1)
def scalekit_client() -> ScalekitClientWrapper:
    return ScalekitClientWrapper()
```

---

## Step 5 — FastAPI dependencies (`app/dependencies.py`)

```python
from typing import Union
from fastapi import HTTPException, Request, status
from fastapi.responses import RedirectResponse
from app.scalekit_client import scalekit_client

def require_login(request: Request) -> Union[dict, RedirectResponse]:
    user = request.session.get('scalekit_user')
    if not user:
        return RedirectResponse(url=f"/login?next={request.url.path}", status_code=302)
    return user

def require_permission(permission: str):
    def checker(request: Request) -> Union[dict, RedirectResponse]:
        user = request.session.get('scalekit_user')
        if not user:
            return RedirectResponse(url=f"/login?next={request.url.path}", status_code=302)
        token_data = request.session.get('scalekit_tokens', {})
        access_token = token_data.get('access_token')
        if not access_token:
            raise HTTPException(status_code=403, detail="No access token")
        client = scalekit_client()
        if not client.has_permission(access_token, permission):
            raise HTTPException(status_code=403, detail=f"Permission '{permission}' required")
        return user
    return checker
```

---

## Step 6 — Token refresh middleware (`app/middleware.py`)

Auto-refreshes the access token 5 minutes before expiry on every request.

```python
import logging
from datetime import datetime, timedelta
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)
REFRESH_BEFORE_SECONDS = 300  # 5 minutes

class ScalekitTokenRefreshMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token_data = request.session.get('scalekit_tokens', {})
        if token_data.get('access_token') and token_data.get('refresh_token'):
            try:
                expires_at_str = token_data.get('expires_at')
                if expires_at_str:
                    expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                    now = datetime.now()
                    if expires_at.tzinfo:
                        from datetime import timezone
                        now = datetime.now(timezone.utc)
                    if (expires_at - now).total_seconds() < REFRESH_BEFORE_SECONDS:
                        from app.scalekit_client import scalekit_client
                        client = scalekit_client()
                        new_tokens = client.refresh_access_token(token_data['refresh_token'])
                        expires_in = new_tokens.get('expires_in', 3600)
                        request.session['scalekit_tokens'] = {
                            'access_token': new_tokens.get('access_token'),
                            'refresh_token': new_tokens.get('refresh_token', token_data['refresh_token']),
                            'id_token': new_tokens.get('id_token', token_data.get('id_token')),
                            'expires_at': (datetime.now() + timedelta(seconds=expires_in)).isoformat(),
                            'expires_in': expires_in,
                        }
            except Exception as e:
                logger.warning(f"Token refresh failed in middleware: {e}")
        return await call_next(request)
```

---

## Step 7 — Auth routes (`app/routes.py`)

```python
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from app.scalekit_client import scalekit_client
from app.dependencies import require_login, require_permission

router = APIRouter()

@router.get("/login")
async def login(request: Request):
    if request.session.get('scalekit_user'):
        return RedirectResponse(url="/dashboard")
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    client = scalekit_client()
    auth_url = client.get_authorization_url(state=state)
    return RedirectResponse(url=auth_url)

@router.get("/auth/callback")
async def callback(request: Request):
    # CSRF check
    state = request.query_params.get('state')
    if state != request.session.pop('oauth_state', None):
        return HTMLResponse("Invalid state", status_code=400)

    code = request.query_params.get('code')
    error = request.query_params.get('error')
    if error or not code:
        return HTMLResponse(f"Auth error: {error or 'no code'}", status_code=400)

    client = scalekit_client()
    token_response = client.exchange_code_for_tokens(code)

    access_token = token_response.get('access_token') or token_response.get('accessToken')
    refresh_token = token_response.get('refresh_token') or token_response.get('refreshToken')
    id_token = token_response.get('id_token') or token_response.get('idToken')
    expires_in = token_response.get('expires_in') or token_response.get('expiresIn') or 3600
    user_obj = token_response.get('user', {})

    request.session['scalekit_user'] = {
        'sub': user_obj.get('id'),
        'email': user_obj.get('email'),
        'name': user_obj.get('name') or f"{user_obj.get('givenName','')} {user_obj.get('familyName','')}".strip(),
        'given_name': user_obj.get('givenName'),
        'family_name': user_obj.get('familyName'),
    }
    request.session['scalekit_tokens'] = {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'id_token': id_token,
        'expires_at': (datetime.now() + timedelta(seconds=expires_in)).isoformat(),
        'expires_in': expires_in,
    }

    # Store roles and permissions for route protection
    try:
        user_info = client.get_user_info(access_token)
        request.session['scalekit_roles'] = user_info.get('roles', [])
        request.session['scalekit_permissions'] = (
            user_info.get('permissions', []) or
            user_info.get('https://scalekit.com/permissions', [])
        )
    except Exception:
        pass

    return RedirectResponse(url="/dashboard", status_code=302)

@router.post("/logout")
async def logout(request: Request):
    token_data = request.session.get('scalekit_tokens', {})
    access_token = token_data.get('access_token')
    request.session.clear()
    if access_token:
        try:
            client = scalekit_client()
            logout_url = client.logout(access_token)
            return RedirectResponse(url=logout_url, status_code=302)
        except Exception:
            pass
    return RedirectResponse(url="/", status_code=302)

@router.get("/dashboard")
async def dashboard(request: Request, user: dict = Depends(require_login)):
    return {"user": user}

@router.get("/admin/settings")
async def admin_settings(request: Request, user: dict = Depends(require_permission('organization:settings'))):
    return {"message": "You have organization:settings permission"}
```

---

## Step 8 — Wire up `main.py`

**Middleware registration order is critical.** In Starlette, middleware added later wraps earlier ones and executes first.

```python
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.middleware import ScalekitTokenRefreshMiddleware
from app.routes import router

app = FastAPI()

# Order matters: add ScalekitTokenRefreshMiddleware first (runs after SessionMiddleware)
app.add_middleware(ScalekitTokenRefreshMiddleware)
# SessionMiddleware runs before token refresh so session data is available
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    max_age=settings.session_max_age,
    same_site='lax',
    https_only=False,  # Set True in production with HTTPS
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(router)
```

---

## Session data structure

| Key | Contents |
|-----|----------|
| `scalekit_user` | `sub`, `email`, `name`, `given_name`, `family_name` |
| `scalekit_tokens` | `access_token`, `refresh_token`, `id_token`, `expires_at`, `expires_in` |
| `scalekit_roles` | `["admin", ...]` |
| `scalekit_permissions` | `["organization:settings", ...]` |

---

## Common patterns

**Read current user in any route:**
```python
user = request.session.get('scalekit_user', {})
```

**Read access token:**
```python
token_data = request.session.get('scalekit_tokens', {})
access_token = token_data.get('access_token')
```

**Check a permission ad-hoc:**
```python
client = scalekit_client()
if client.has_permission(access_token, 'reports:read'):
    ...
```

**Decode JWT claims without validation (e.g. for expiry):**
```python
import base64, json
payload = access_token.split('.')[1]
payload += '=' * (4 - len(payload) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload))
```

---

## Checklist

- [ ] `.env` populated with all 5 Scalekit env vars
- [ ] `SCALEKIT_REDIRECT_URI` matches the redirect URI registered in Scalekit dashboard
- [ ] `offline_access` in scopes (for refresh token)
- [ ] `SessionMiddleware` added **after** `ScalekitTokenRefreshMiddleware` in `main.py`
- [ ] `SECRET_KEY` is a strong random string in production
- [ ] `https_only=True` on `SessionMiddleware` in production
- [ ] CSRF state check in `/auth/callback` is present

## Tactics

### SameSite=Lax — never Strict
`SessionMiddleware` `same_site` must be `'lax'`, not `'strict'`. The OAuth callback is a cross-site redirect from Scalekit back to your app — `'strict'` drops the session cookie on that redirect so `oauth_state` is missing and the CSRF check fails.

### CORS for browser clients
If a JavaScript frontend calls the FastAPI backend, add CORS before `SessionMiddleware`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # explicit origin required
    allow_credentials=True,                  # required for session cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> ⚠️ `allow_origins=["*"]` does not work with `allow_credentials=True`. Always specify explicit origins.

### AJAX: 401 instead of redirect
Browser clients making AJAX calls expect `401`, not a `302` redirect. Detect JSON requests in `require_login`:

```python
def require_login(request: Request):
    user = request.session.get('scalekit_user')
    if not user:
        if 'application/json' in request.headers.get('Accept', ''):
            raise HTTPException(status_code=401, detail="Authentication required")
        return RedirectResponse(url=f"/login?next={request.url.path}", status_code=302)
    return user
```

### Fix: clear session on invalid_grant in middleware
The middleware currently only logs `invalid_grant`. It should also clear the session to force re-login:

```python
except Exception as e:
    logger.warning(f"Token refresh failed in middleware: {e}")
    if 'invalid_grant' in str(e).lower():
        request.session.clear()  # force re-login on next request
```

### Deep link preservation

```python
@router.get("/login")
async def login(request: Request, next: str = "/dashboard"):
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    request.session['next'] = next       # preserve intended URL

@router.get("/auth/callback")
async def callback(request: Request):
    ...
    next_url = request.session.pop('next', '/dashboard')
    if not next_url.startswith('/'):     # prevent open redirect
        next_url = '/dashboard'
    return RedirectResponse(url=next_url, status_code=302)
```

### Cache-Control: no-store on protected responses

```python
from fastapi import Response

@router.get("/dashboard")
async def dashboard(request: Request, response: Response, user: dict = Depends(require_login)):
    response.headers["Cache-Control"] = "no-store"
    return {"user": user}
```

Prevents the browser from serving a cached authenticated page after logout via the back button.
