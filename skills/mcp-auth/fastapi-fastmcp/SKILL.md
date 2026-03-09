# FastAPI + FastMCP OAuth Authentication with Scalekit

## Overview

This skill documents the pattern for building production-ready MCP (Model Context Protocol) servers using FastAPI and FastMCP with OAuth 2.1 Bearer token authentication via Scalekit. This approach provides fine-grained control over authentication middleware, token validation, and server behavior compared to using FastMCP's built-in OAuth provider.

## When to Use This Pattern

Use this FastAPI + FastMCP integration when you need:

- **Custom middleware requirements**: Implement rate limiting, request logging, or complex authorization logic beyond basic token validation
- **Existing FastAPI applications**: Integrate MCP tools into established FastAPI codebases without rewriting
- **Advanced authorization**: Enforce scope-based access control, multi-tenancy, or custom claims validation
- **Full HTTP control**: Manage CORS policies, health checks, and multiple endpoints alongside MCP tools
- **Production requirements**: Add monitoring, metrics, and deployment-specific configurations

**Don't use this pattern** if FastMCP's built-in OAuth provider meets your needs—the additional FastAPI layer adds complexity.

## Core Architecture

### Token Validation Flow

```
MCP Client → FastAPI Server (401 + WWW-Authenticate)
MCP Client → Scalekit (Exchange code for token)
Scalekit → MCP Client (Bearer token)
MCP Client → FastAPI Server (Request + Bearer token)
FastAPI Middleware → Scalekit SDK (Validate token)
FastAPI → MCP Tool Handler → Response
```

### Key Components

1. **FastAPI Middleware**: Custom HTTP middleware that intercepts all requests and validates Bearer tokens before routing to MCP handlers
2. **Scalekit SDK Integration**: Python SDK validates JWT signatures, expiration, issuer, and audience claims
3. **OAuth Resource Metadata Endpoint**: Well-known endpoint (`/.well-known/oauth-protected-resource`) for client discovery
4. **FastMCP Tool Registration**: Standard MCP tool definitions with `@mcp.tool` decorator
5. **WWW-Authenticate Headers**: Standard OAuth 2.1 challenge response directing clients to resource metadata

## Implementation Patterns

### 1. Environment Configuration

**Required variables:**
- `SK_ENV_URL`: Scalekit environment URL (issuer)
- `SK_CLIENT_ID` + `SK_CLIENT_SECRET`: SDK authentication credentials
- `EXPECTED_AUDIENCE`: The resource identifier that tokens must target
- `PROTECTED_RESOURCE_METADATA`: Complete OAuth discovery metadata JSON
- `PORT`: Server listening port (must match registered server URL)

**Security:**
- Never commit `.env` files to version control
- Use secret managers in production (AWS Secrets Manager, HashiCorp Vault)
- Rotate `SK_CLIENT_SECRET` regularly
- Validate `EXPECTED_AUDIENCE` matches your server's public URL exactly

### 2. Middleware Authentication Pattern

```python
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Exempt public endpoints
    if request.url.path in {"/health", "/.well-known/oauth-protected-resource"}:
        return await call_next(request)

    # Extract Bearer token
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return Response(
            '{"error": "Missing Bearer token"}',
            status_code=401,
            headers={"WWW-Authenticate": f'Bearer realm="OAuth", resource_metadata="{RESOURCE_METADATA_URL}"'},
            media_type="application/json"
        )

    token = auth_header.split("Bearer ", 1)[1].strip()

    # Validate with Scalekit SDK
    options = TokenValidationOptions(
        issuer=SK_ENV_URL,
        audience=[EXPECTED_AUDIENCE]
    )

    try:
        is_valid = scalekit_client.validate_access_token(token, options=options)
        if not is_valid:
            raise ValueError("Invalid token")
    except Exception:
        return Response(
            '{"error": "Token validation failed"}',
            status_code=401,
            headers=WWW_HEADER,
            media_type="application/json"
        )

    return await call_next(request)
```

**Key principles:**
- Validate on every request except explicitly public endpoints
- Return 401 with WWW-Authenticate header for missing/invalid tokens
- Use Scalekit SDK for cryptographic validation—never implement custom JWT validation
- Verify issuer and audience claims to prevent token substitution attacks

### 3. Resource Metadata Endpoint

```python
@app.get("/.well-known/oauth-protected-resource")
async def oauth_metadata():
    if not PROTECTED_RESOURCE_METADATA:
        return Response(
            '{"error": "PROTECTED_RESOURCE_METADATA config missing"}',
            status_code=500,
            media_type="application/json"
        )

    metadata = json.loads(PROTECTED_RESOURCE_METADATA)
    return Response(
        json.dumps(metadata, indent=2),
        media_type="application/json"
    )
```

**Purpose:**
- Enables MCP client discovery of authorization requirements
- Clients fetch this metadata when they receive a 401 response
- Contains authorization server endpoints and supported token types
- Must be publicly accessible (no authentication required)

### 4. FastMCP Tool Registration

```python
@mcp.tool(
    name="greet_user",
    description="Greets the user with a personalized message."
)
async def greet_user(name: str, ctx: Context | None = None) -> dict:
    return {
        "content": [
            {
                "type": "text",
                "text": f"Hi {name}, welcome to Scalekit!"
            }
        ]
    }
```

**Tool design:**
- Use descriptive names and clear descriptions for AI discoverability
- Accept `ctx: Context | None` to access authenticated user context in future
- Return MCP-compliant response format with `content` array
- Tools automatically inherit authentication from middleware—no per-tool auth needed

### 5. Application Mounting

```python
mcp_app = mcp.http_app(path="/")
app = FastAPI(lifespan=mcp_app.lifespan)

# Add middleware (CORS, auth, etc.)
app.add_middleware(CORSMiddleware, ...)

# Add custom endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Mount MCP at root
app.mount("/", mcp_app)
```

**Layering order:**
1. Create FastMCP HTTP app
2. Create FastAPI app with shared lifespan
3. Add FastAPI middleware (CORS, auth)
4. Register custom endpoints (health, metadata)
5. Mount FastMCP app last

## Security Considerations

### Token Validation
- **Always validate issuer**: Prevents tokens from other OAuth servers being accepted
- **Always validate audience**: Ensures token was issued for your specific resource
- **Check expiration**: Scalekit SDK automatically validates `exp` claim
- **Verify signature**: SDK checks JWT signature against Scalekit's public keys

### Common Vulnerabilities to Avoid
1. **Skipping audience validation**: Tokens from other Scalekit resources could be used
2. **Custom JWT parsing**: Use SDK validation—don't implement your own
3. **Logging tokens**: Never log Bearer tokens in middleware or error handlers
4. **Missing CORS configuration**: Can enable cross-origin attacks
5. **Hardcoded secrets**: Use environment variables and secret managers

### Production Hardening
- Run behind reverse proxy (Nginx, Caddy) with HTTPS termination
- Use multiple Uvicorn workers: `uvicorn main:app --workers 4`
- Implement rate limiting per client/token
- Add request/response logging middleware (without tokens)
- Monitor token validation failures for attack patterns
- Set up health check endpoints for load balancers

## Testing Strategy

### Local Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector@latest
```

1. Connect to `http://localhost:3002/`
2. Inspector handles OAuth flow automatically
3. Test each tool with various inputs
4. Verify middleware logs show successful validation

### Manual Token Testing
```bash
# Get token from Scalekit (via OAuth flow or test endpoint)
export TOKEN="<your-access-token>"

# Test authenticated request
curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/call","params":{"name":"greet_user","arguments":{"name":"Saif"}}}' \
     http://localhost:3002/

# Test missing token (should return 401)
curl -v http://localhost:3002/
```

### Integration Tests
```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_missing_token():
    response = client.post("/")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers

def test_invalid_token():
    response = client.post(
        "/",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
```

## Common Pitfalls

### 1. Mismatched Audience
**Symptom**: Tokens fail validation with "invalid audience" error
**Cause**: `EXPECTED_AUDIENCE` doesn't match the Server URL registered in Scalekit
**Fix**: Ensure both have identical values including trailing slashes

### 2. Middleware Order Issues
**Symptom**: CORS errors or authentication bypassed
**Cause**: Mounting order affects execution sequence
**Fix**: Add middleware before mounting MCP app; mount MCP last

### 3. Missing Resource Metadata
**Symptom**: Clients can't discover how to authenticate
**Cause**: `PROTECTED_RESOURCE_METADATA` not set or endpoint not working
**Fix**: Verify metadata JSON is copied correctly from Scalekit dashboard

### 4. Development vs Production URLs
**Symptom**: Works locally but fails in production
**Cause**: Hardcoded localhost URLs in configuration
**Fix**: Use environment-specific values for `EXPECTED_AUDIENCE` and `RESOURCE_METADATA_URL`

### 5. Token Expiration During Testing
**Symptom**: Tests pass initially then fail after 1 hour
**Cause**: Access tokens expire (default 3600 seconds)
**Fix**: Refresh tokens before each test run or implement automatic refresh

## Extension Patterns

### Adding Scope-Based Authorization
```python
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # ... existing token validation ...

    # Decode token to access claims (after validation)
    import jwt
    decoded = jwt.decode(token, options={"verify_signature": False})
    scopes = decoded.get("scope", "").split()

    # Attach to request state
    request.state.scopes = scopes
    request.state.user_id = decoded.get("sub")

    return await call_next(request)

@mcp.tool()
async def admin_tool(ctx: Context) -> dict:
    # Access request state in tool
    if "admin" not in ctx.request_context.state.scopes:
        raise PermissionError("Requires admin scope")
    # ... tool logic ...
```

### Multi-Tenancy Support
```python
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # ... validate token ...

    decoded = jwt.decode(token, options={"verify_signature": False})
    org_id = decoded.get("org_id")

    request.state.org_id = org_id
    return await call_next(request)

@mcp.tool()
async def get_org_data(ctx: Context) -> dict:
    org_id = ctx.request_context.state.org_id
    # Fetch data scoped to org_id
```

### Rate Limiting
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/")
@limiter.limit("10/minute")
async def mcp_endpoint(request: Request):
    # Rate-limited MCP calls
    pass
```

## Dependencies

### Required Python Packages
```txt
mcp>=1.0.0                          # MCP protocol implementation
fastapi>=0.104.0                    # Web framework
fastmcp>=0.8.0                      # FastMCP integration
uvicorn>=0.24.0                     # ASGI server
pydantic>=2.5.0                     # Data validation
python-dotenv>=1.0.0                # Environment variables
httpx>=0.25.0                       # HTTP client
python-jose[cryptography]>=3.3.0    # JWT handling
cryptography>=41.0.0                # Cryptographic operations
scalekit-sdk-python>=2.4.0          # Scalekit authentication
starlette>=0.27.0                   # ASGI toolkit
```

### Version Pinning Strategy
- Pin exact versions in production `requirements.txt`
- Use `>=` for development flexibility
- Test version upgrades in staging before production
- Monitor security advisories for all dependencies

## Complete Working Example

A full production-ready FastAPI + FastMCP server is available in the Scalekit MCP Auth Demos repository:

**GitHub Repository:** [scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-python](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-python)

This example includes:
- Complete server implementation with modular architecture
- OAuth 2.1 authentication middleware
- FastMCP tool registration
- CORS configuration and health checks
- Production-ready logging and error handling

### Key Files

- `main.py` - Main server entry point with FastAPI app
- `src/config/config.py` - Environment configuration
- `src/lib/auth.py` - OAuth discovery endpoint handler
- `src/lib/middleware.py` - Token validation middleware
- `src/lib/transport.py` - MCP transport layer setup

### Getting Started

```bash
cd greeting-mcp-python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

See [README.md](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-python) for complete setup instructions.

## Related Resources

- [FastMCP Documentation](https://github.com/jlowin/fastmcp)
- [FastAPI Middleware Guide](https://fastapi.tiangolo.com/tutorial/middleware/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Scalekit MCP Authentication Docs](https://docs.scalekit.com/guides/mcp/)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Scalekit MCP Auth Demos](https://github.com/scalekit-inc/mcp-auth-demos/tree/main)

## Changelog

- **2026-02-13**: Initial skill documentation based on FastAPI + FastMCP quickstart guide
