---
name: adding-mcp-oauth
description: Guides users through adding OAuth 2.1 authorization to Model Context Protocol (MCP) servers using Scalekit. Use when setting up MCP servers, implementing authentication for AI hosts like Claude Desktop, Cursor, or VS Code, or when users mention MCP security, OAuth, or Scalekit integration.
---

# Adding OAuth 2.1 Authorization to MCP Servers

Secure your MCP server with production-ready OAuth 2.1 authorization using Scalekit. This enables authenticated access through AI hosts like Claude Desktop, Cursor, and VS Code.

## Critical Prerequisites

⚠️ **MCP OAuth requires HTTP-based transport (Streamable HTTP)**: OAuth 2.1 authentication only works when your MCP server is exposed over **HTTP** using the **Streamable HTTP** transport. The standard `StdioServerTransport` (stdin/stdout) does **not** support OAuth flows.

**Node.js requirement:**
```javascript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

**Python requirement (Streamable HTTP via ASGI app):**

In Python, the practical equivalent of Node’s `StreamableHTTPServerTransport` is to **create a Streamable HTTP ASGI app** and run it behind an ASGI server (Uvicorn/Hypercorn). The official Python SDK exposes this as `streamable_http_app()` (convenience) or `create_streamable_http_app(...)` (lower-level).

**Accurate Python snippet (FastMCP + Streamable HTTP):**
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("My MCP Server")

@mcp.tool
def ping() -> str:
    return "pong"

# HTTP-based transport required for OAuth-capable deployments
app = mcp.streamable_http_app(path="/mcp")
```

**Lower-level equivalent (explicit constructor):**
```python
from mcp.server.fastmcp import FastMCP
from fastmcp.server.http import create_streamable_http_app

mcp = FastMCP("My MCP Server")
app = create_streamable_http_app(server=mcp, streamable_http_path="/mcp")
```

Notes:
- The imports above match the **official** Python MCP SDK on PyPI (`mcp`). See: `https://pypi.org/project/mcp/1.9.1/`
- The result is an **ASGI `app`** you run with an ASGI server (e.g. `uvicorn module:app`)—this is **Streamable HTTP**, not stdio.
- SSE-only transports are not the same as Streamable HTTP; for OAuth with MCP hosts (Claude Desktop/Cursor/VS Code), use Streamable HTTP. See: `https://gofastmcp.com/python-sdk/fastmcp-server-http`
  - Example run: `uvicorn your_module:app --host 0.0.0.0 --port 8000`

If your MCP server currently uses stdio transport, you must migrate to HTTP-based transport before implementing OAuth. See [MCP Transport Documentation](https://spec.modelcontextprotocol.io/specification/architecture/#transports) for migration guidance.

## Setup workflow

Copy this checklist and track progress:

```
MCP OAuth Setup:
- [ ] Step 1: Install Scalekit SDK
- [ ] Step 2: Register MCP server in Scalekit dashboard
- [ ] Step 3: Implement discovery endpoint
- [ ] Step 4: Add token validation middleware
- [ ] Step 5: (Optional) Add scope-based authorization
- [ ] Step 6: Test with AI hosts
```

## Step 1: Install Scalekit SDK

**Node.js:**
```bash
npm install @scalekit-sdk/node@2.2.0-beta.1
```

**Python:**
```bash
pip install scalekit-sdk-python
```

Get credentials from [Scalekit dashboard](https://app.scalekit.com/) after creating an account.

## Step 2: Register MCP server

In Scalekit dashboard:
1. Go to **MCP servers** → **Add MCP server**
2. Provide a descriptive **name** (appears on consent page)
3. Enable **dynamic client registration** (allows automatic MCP host registration)
4. Enable **Client ID Metadata Document (CIMD)** (fetches client metadata automatically)
5. Click **Save**

**Advanced settings** (optional):
- **Server URL**: Your MCP server identifier (e.g., `https://mcp.yourapp.com`)
- **Access token lifetime**: 300-3600 seconds recommended
- **Scopes**: Define permissions like `todo:read`, `todo:write`

**Important**: Restart your MCP server after toggling DCR or CIMD settings.

## Step 3: Implement discovery endpoint

Create `/.well-known/oauth-protected-resource` endpoint. Copy metadata JSON from **Dashboard > MCP Servers > Your server > Metadata JSON**.

**Node.js (Express):**
```javascript
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    "authorization_servers": [
      "https://<SCALEKIT_ENVIRONMENT_URL>/resources/<YOUR_RESOURCE_ID>"
    ],
    "bearer_methods_supported": ["header"],
    "resource": "https://mcp.yourapp.com",
    "resource_documentation": "https://mcp.yourapp.com/docs",
    "scopes_supported": ["todo:read", "todo:write"]
  });
});
```

**Python (FastAPI):**
```python
@app.get("/.well-known/oauth-protected-resource")
async def get_oauth_protected_resource():
    return {
        "authorization_servers": [
            "https://<SCALEKIT_ENVIRONMENT_URL>/resources/<YOUR_RESOURCE_ID>"
        ],
        "bearer_methods_supported": ["header"],
        "resource": "https://mcp.yourapp.com",
        "resource_documentation": "https://mcp.yourapp.com/docs",
        "scopes_supported": ["todo:read", "todo:write"]
    }
```

Replace placeholders with actual values from Scalekit dashboard.

## Step 4: Add token validation middleware

### Initialize Scalekit client

**Node.js:**
```javascript
import { Scalekit } from '@scalekit-sdk/node';

const scalekit = new Scalekit(
  process.env.SCALEKIT_ENVIRONMENT_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);

const RESOURCE_ID = 'https://your-mcp-server.com';  // Or autogenerated ID from dashboard
const METADATA_ENDPOINT = 'https://your-mcp-server.com/.well-known/oauth-protected-resource';

export const WWWHeader = {
  HeaderKey: 'WWW-Authenticate',
  HeaderValue: `Bearer realm="OAuth", resource_metadata="${METADATA_ENDPOINT}"`
};
```

**Python:**
```python
from scalekit import ScalekitClient
import os

scalekit_client = ScalekitClient(
    env_url=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
    client_id=os.getenv("SCALEKIT_CLIENT_ID"),
    client_secret=os.getenv("SCALEKIT_CLIENT_SECRET")
)

RESOURCE_ID = "https://your-mcp-server.com"
METADATA_ENDPOINT = "https://your-mcp-server.com/.well-known/oauth-protected-resource"

WWW_HEADER = {
    "WWW-Authenticate": f'Bearer realm="OAuth", resource_metadata="{METADATA_ENDPOINT}"'
}
```

### Implement authentication middleware

**Node.js:**
```javascript
export async function authMiddleware(req, res, next) {
  try {
    // Allow public access to well-known endpoints
    if (req.path.includes('.well-known')) {
      return next();
    }

    // Extract Bearer token
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]?.trim()
      : null;

    if (!token) {
      throw new Error('Missing or invalid Bearer token');
    }

    // Validate token against resource audience
    await scalekit.validateToken(token, {
      audience: [RESOURCE_ID]
    });

    next();
  } catch (err) {
    return res
      .status(401)
      .set(WWWHeader.HeaderKey, WWWHeader.HeaderValue)
      .end();
  }
}

// Apply to all MCP endpoints
app.use('/', authMiddleware);
```

**Python:**
```python
from scalekit.common.scalekit import TokenValidationOptions
from fastapi import Request, HTTPException, status

async def auth_middleware(request: Request, call_next):
    # Allow public access to well-known endpoints
    if request.url.path.startswith("/.well-known"):
        return await call_next(request)

    # Extract Bearer token
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split("Bearer ")[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers=WWW_HEADER
        )

    # Validate token
    try:
        options = TokenValidationOptions(
            issuer=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
            audience=[RESOURCE_ID]
        )
        scalekit_client.validate_token(token, options=options)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers=WWW_HEADER
        )

    return await call_next(request)

# Apply to all MCP endpoints
app.middleware("http")(auth_middleware)
```

## Step 5: Scope-based tool authorization (Optional)

Add fine-grained access control at the tool execution level:

**Node.js:**
```javascript
try {
    await scalekit.validateToken(token, {
      audience: [RESOURCE_ID],
      requiredScopes: [scope]  // e.g., 'todo:write'
    });
} catch(error) {
    return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scope: ${scope}`,
        scope: scope
    });
}
```

**Python:**
```python
try:
    scalekit_client.validate_access_token(
        token,
        options=TokenValidationOptions(
            audience=[RESOURCE_ID],
            required_scopes=[scope]
        )
    )
except Exception:
    return {
        "error": "insufficient_scope",
        "error_description": f"Required scope: {scope}",
        "scope": scope
    }
```

## Step 6: Verify and deploy

### Verify your integration

Before testing with AI hosts, Claude Code will scan your project to determine
the right URL to verify against. It will look for:

- `RESOURCE_ID` or `resource` values in your code or `.env`
- The host/domain used in `/.well-known/oauth-protected-resource`
- Any deployed base URL in environment config (`SERVER_URL`, `PUBLIC_URL`, etc.)

If no URL is found, you'll be asked:
> "What is your MCP server base URL?
> (e.g., `https://mcp.yourapp.com` or `https://mcp.yourapp.com/mcp`)"

Once the URL is known, run these three checks:

**Check 1 – Confirm 401 without token:**
```bash
curl -i <your-mcp-url>
```
Expected: `HTTP/1.1 401 Unauthorized`

**Check 2 – Confirm WWW-Authenticate header:**
The response must include:
```
WWW-Authenticate: Bearer realm="OAuth", resource_metadata="https://<your-domain>/.well-known/oauth-protected-resource"
```
This is what triggers the MCP client's OAuth flow. A plain 401 without this header
will cause AI hosts (Claude Desktop, Cursor, VS Code) to fail silently.

**Check 3 – Confirm metadata endpoint is reachable:**
```bash
curl https://<your-domain>/.well-known/oauth-protected-resource
```
Expected: JSON with `resource`, `authorization_servers`, and `scopes_supported`.

### Testing checklist (after verification passes)
- [ ] Test with Claude Desktop
- [ ] Test with Cursor
- [ ] Test with VS Code
- [ ] Verify token validation rejects invalid tokens
- [ ] Verify scope-based authorization (if implemented)

### Production deployment checklist
- [ ] Configure CORS policies for endpoints
- [ ] Set up monitoring and logging for auth events
- [ ] Use HTTPS for all communications
- [ ] Store credentials in environment variables or secret management
- [ ] Configure appropriate token lifetimes
- [ ] Document authentication flow for users

## Additional authentication methods

Beyond OAuth 2.1, enable these methods through Scalekit (no code changes needed):

**Enterprise SSO**: Organizations authenticate through Okta, Azure AD, Google Workspace
- Requires organization admins to register domains with Scalekit
- Centralized access control through enterprise identity systems

**Social logins**: Users authenticate via Google, GitHub, Microsoft
- Quick onboarding for individual users
- Reduced friction for personal and small team use

**Custom auth**: Use your own authentication system
- Integrate existing user management
- Maintain full control over authentication flow

See Scalekit documentation for configuration details.

## Framework-specific guides

For detailed implementation guides with specific frameworks:
- **FastMCP**: 5-line integration with Scalekit provider (simplest approach)
- **Express.js**: Full OAuth implementation with manual middleware (most control)
- **FastAPI + FastMCP**: Python-based implementation with custom middleware

See [Complete Working Examples](#complete-working-examples) below for production-ready code.

## Complete Working Examples

Production-ready examples demonstrating different implementation approaches:

### FastMCP (5-Line OAuth Integration)
**Skill:** [add-auth-fastmcp](../add-auth-fastmcp/SKILL.md)
- Simplest approach with built-in OAuth provider
- Automatic token validation and scope enforcement
- Complete todo server with CRUD operations
- **GitHub:** [todo-fastmcp](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/todo-fastmcp)

### Express.js (Full Manual OAuth)
**Skill:** [express-mcp-server](../express-mcp-server/SKILL.md)
- Complete control over authentication middleware
- Modular architecture with transport, tools, auth layers
- Production-ready with CORS, logging, error handling
- **GitHub:** [greeting-mcp-node](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-node)

### FastAPI + FastMCP (Custom Middleware)
**Skill:** [fastapi-fastmcp](../fastapi-fastmcp/SKILL.md)
- Python-based with custom authentication middleware
- Combines FastAPI's HTTP control with FastMCP's tooling
- Ideal for existing FastAPI applications
- **GitHub:** [greeting-mcp-python](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-python)

### Scalekit MCP Server (Production Reference)
**Reference:** [scalekit-mcp-server.md](../../references/scalekit-mcp-server.md)
- Official Scalekit production implementation
- Comprehensive tooling for identity management
- Advanced patterns: scope-based auth, pagination, multi-step operations
- Demonstrates best practices for complex MCP servers
- **GitHub:** [scalekit-inc/scalekit-mcp-server](https://github.com/scalekit-inc/scalekit-mcp-server)

### Choosing an Example

| Example | Complexity | Best For | Control Level |
|----------|-------------|-----------|---------------|
| FastMCP | Simplest | Quick prototypes, minimal code | Low (automatic) |
| Express.js | Medium | Production Node.js, custom logic | High (manual) |
| FastAPI + FastMCP | Medium | Production Python, existing apps | High (manual) |
| Scalekit Server | Advanced | Complex apps, reference patterns | Very High |

All examples include:
- Complete source code
- Setup instructions
- Environment configuration
- Testing guidance

## Common issues

**Token validation fails**:
- Verify RESOURCE_ID matches Server URL in dashboard
- Check environment variables are set correctly
- Ensure token hasn't expired

**Discovery endpoint not found**:
- Verify endpoint path is exactly `/.well-known/oauth-protected-resource`
- Check endpoint is publicly accessible (not protected by auth middleware)

**Scope validation errors**:
- Verify scopes in dashboard match those in code
- Check token includes required scopes
- Ensure scope strings match exactly (case-sensitive)

## Architecture summary

**Scalekit OAuth server**:
- Authenticates users and agents
- Issues access tokens with scopes
- Manages OAuth 2.1 flows
- Supports dynamic client registration

**Your MCP server**:
- Validates incoming tokens
- Enforces permissions from token scopes
- Executes tool calls for authorized requests

This separation ensures clean boundaries: Scalekit handles identity and token issuance, your server focuses on business logic.
