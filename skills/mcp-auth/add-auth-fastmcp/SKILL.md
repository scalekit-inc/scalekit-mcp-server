---
name: mcp-oauth-fastmcp
description: Add OAuth 2.1 authorization to FastMCP servers using Scalekit provider plugin. Use when building FastMCP servers, when users mention FastMCP authentication, Python MCP servers with Scalekit, or need rapid OAuth integration with minimal code.
---

# FastMCP OAuth with Scalekit Provider

Secure your FastMCP server with OAuth 2.1 in just 5 lines of code using Scalekit's built-in provider. This approach handles token validation, scope enforcement, and authentication flows automatically.

## FastMCP advantage

**Standard MCP OAuth**: ~30 lines of middleware code, manual token validation
**FastMCP with Scalekit provider**: ~5 lines of configuration, automatic token handling

## Setup workflow

Copy this checklist and track progress:

```
FastMCP OAuth Setup:
- [ ] Step 1: Register MCP server in Scalekit
- [ ] Step 2: Install FastMCP and dependencies
- [ ] Step 3: Configure Scalekit provider
- [ ] Step 4: Add scope validation to tools
- [ ] Step 5: Test with MCP Inspector
```

## Step 1: Register MCP server

In Scalekit dashboard:

1. Navigate to **Dashboard > MCP Servers > Add MCP Server**
2. Enter server name (e.g., `FastMCP Todo Server`)
3. Set **Server URL** to `http://localhost:3002/` (include trailing slash)
4. Define scopes for your tools (e.g., `todo:read`, `todo:write`)
5. Click **Save** and note the `resource_id`

**Critical**: Use base URL with trailing slash. FastMCP appends `/mcp` automatically.
- ✓ Correct: `http://localhost:3002/`
- ✗ Wrong: `http://localhost:3002/mcp`

## Step 2: Install dependencies

Create project structure:

```bash
mkdir fastmcp-server
cd fastmcp-server
python3 -m venv venv
source venv/bin/activate
```

Create `requirements.txt`:

```txt
fastmcp>=2.13.0.2
python-dotenv>=1.0.0
```

Install:

```bash
pip install -r requirements.txt
```

## Step 3: Configure Scalekit provider

Create `.env` file with Scalekit credentials:

```bash
PORT=3002
SCALEKIT_ENVIRONMENT_URL=https://your-env.scalekit.com
SCALEKIT_CLIENT_ID=your_client_id
SCALEKIT_RESOURCE_ID=res_your_resource_id
MCP_URL=http://localhost:3002/
```

Get these values from **Scalekit Dashboard > Settings** and your MCP server configuration.

Initialize FastMCP server with Scalekit provider (`server.py`):

```python
import os
from dotenv import load_dotenv
from fastmcp import FastMCP
from fastmcp.server.auth.providers.scalekit import ScalekitProvider

load_dotenv()

# 5-line OAuth setup
mcp = FastMCP(
    "Your Server Name",
    stateless_http=True,
    auth=ScalekitProvider(
        environment_url=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
        client_id=os.getenv("SCALEKIT_CLIENT_ID"),
        resource_id=os.getenv("SCALEKIT_RESOURCE_ID"),
        mcp_url=os.getenv("MCP_URL"),
    ),
)

if __name__ == "__main__":
    mcp.run(transport="http", port=int(os.getenv("PORT", "3002")))
```

That's it! The Scalekit provider handles:
- Token validation on every request
- OAuth flow with MCP clients
- WWW-Authenticate header responses
- Discovery endpoint (`/.well-known/oauth-protected-resource`)

## Step 4: Add scope validation to tools

Use the built-in `get_access_token()` dependency to validate scopes:

```python
from fastmcp.server.dependencies import AccessToken, get_access_token

def _require_scope(scope: str) -> str | None:
    """Validate request token has required scope."""
    token: AccessToken = get_access_token()
    if scope not in token.scopes:
        return f"Insufficient permissions: `{scope}` scope required."
    return None

@mcp.tool
def create_todo(title: str, description: str = None) -> dict:
    """Create a new todo item. Requires todo:write scope."""
    error = _require_scope("todo:write")
    if error:
        return {"error": error}

    # Your tool implementation
    todo_id = str(uuid.uuid4())
    return {"id": todo_id, "title": title, "description": description}

@mcp.tool
def list_todos() -> dict:
    """List all todos. Requires todo:read scope."""
    error = _require_scope("todo:read")
    if error:
        return {"error": error}

    # Your tool implementation
    return {"todos": [...]}
```

**Pattern**: Every tool that requires authorization should call `_require_scope()` first.

## Step 5: Test with MCP Inspector

Run your server:

```bash
source venv/bin/activate
python server.py
```

Launch MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

In Inspector:
1. Enter URL: `http://localhost:3002/mcp`
2. Leave authentication fields empty (uses dynamic client registration)
3. Click **Connect**
4. Complete OAuth flow when prompted
5. Test tools with scoped tokens

**Testing scope enforcement**:
- Call `create_todo` with token that only has `todo:read` → should fail
- Call `list_todos` with `todo:read` scope → should succeed

## Complete example: Todo server

```python
import os
import uuid
from dataclasses import dataclass, asdict
from typing import Optional

from dotenv import load_dotenv
from fastmcp import FastMCP
from fastmcp.server.auth.providers.scalekit import ScalekitProvider
from fastmcp.server.dependencies import AccessToken, get_access_token

load_dotenv()

mcp = FastMCP(
    "Todo Server",
    stateless_http=True,
    auth=ScalekitProvider(
        environment_url=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
        client_id=os.getenv("SCALEKIT_CLIENT_ID"),
        resource_id=os.getenv("SCALEKIT_RESOURCE_ID"),
        mcp_url=os.getenv("MCP_URL"),
    ),
)

@dataclass
class TodoItem:
    id: str
    title: str
    description: Optional[str]
    completed: bool = False

    def to_dict(self) -> dict:
        return asdict(self)

_TODO_STORE: dict[str, TodoItem] = {}

def _require_scope(scope: str) -> Optional[str]:
    token: AccessToken = get_access_token()
    if scope not in token.scopes:
        return f"Insufficient permissions: `{scope}` scope required."
    return None

@mcp.tool
def create_todo(title: str, description: Optional[str] = None) -> dict:
    error = _require_scope("todo:write")
    if error:
        return {"error": error}

    todo = TodoItem(id=str(uuid.uuid4()), title=title, description=description)
    _TODO_STORE[todo.id] = todo
    return {"todo": todo.to_dict()}

@mcp.tool
def list_todos(completed: Optional[bool] = None) -> dict:
    error = _require_scope("todo:read")
    if error:
        return {"error": error}

    todos = [
        todo.to_dict()
        for todo in _TODO_STORE.values()
        if completed is None or todo.completed == completed
    ]
    return {"todos": todos}

@mcp.tool
def get_todo(todo_id: str) -> dict:
    error = _require_scope("todo:read")
    if error:
        return {"error": error}

    todo = _TODO_STORE.get(todo_id)
    if todo is None:
        return {"error": f"Todo `{todo_id}` not found."}

    return {"todo": todo.to_dict()}

@mcp.tool
def update_todo(
    todo_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    completed: Optional[bool] = None,
) -> dict:
    error = _require_scope("todo:write")
    if error:
        return {"error": error}

    todo = _TODO_STORE.get(todo_id)
    if todo is None:
        return {"error": f"Todo `{todo_id}` not found."}

    if title is not None:
        todo.title = title
    if description is not None:
        todo.description = description
    if completed is not None:
        todo.completed = completed

    return {"todo": todo.to_dict()}

@mcp.tool
def delete_todo(todo_id: str) -> dict:
    error = _require_scope("todo:write")
    if error:
        return {"error": error}

    todo = _TODO_STORE.pop(todo_id, None)
    if todo is None:
        return {"error": f"Todo `{todo_id}` not found."}

    return {"deleted": todo_id}

if __name__ == "__main__":
    mcp.run(transport="http", port=int(os.getenv("PORT", "3002")))
```

## Environment variable reference

| Variable | Description | Example |
|----------|-------------|---------|
| `SCALEKIT_ENVIRONMENT_URL` | Your Scalekit environment URL | `https://yourenv.scalekit.com` |
| `SCALEKIT_CLIENT_ID` | Client ID from Scalekit dashboard | `skc_...` |
| `SCALEKIT_RESOURCE_ID` | MCP server resource ID | `res_...` |
| `MCP_URL` | Base URL with trailing slash | `http://localhost:3002/` |
| `PORT` | HTTP server port | `3002` |

## Scope design patterns

**Read-only operations**: Use `*:read` scope
- `todo:read`, `data:read`, `user:read`

**Write operations**: Use `*:write` scope
- `todo:write`, `data:write`, `user:write`

**Admin operations**: Use `*:admin` scope
- `system:admin`, `user:admin`

**Multiple scopes per tool**: Return error if ANY required scope is missing

```python
def _require_scopes(scopes: list[str]) -> str | None:
    token: AccessToken = get_access_token()
    missing = [s for s in scopes if s not in token.scopes]
    if missing:
        return f"Missing scopes: {', '.join(missing)}"
    return None

@mcp.tool
def admin_action() -> dict:
    error = _require_scopes(["todo:write", "admin:access"])
    if error:
        return {"error": error}
    # Implementation
```

## Production deployment

### Security checklist
- [ ] Store `.env` in secret manager (AWS Secrets Manager, Vault)
- [ ] Use HTTPS for all public endpoints
- [ ] Rotate `SCALEKIT_CLIENT_SECRET` regularly
- [ ] Enable rate limiting on MCP endpoints
- [ ] Log all authentication failures
- [ ] Monitor token validation errors

### Environment-specific configuration

**Development**:
```bash
MCP_URL=http://localhost:3002/
```

**Production**:
```bash
MCP_URL=https://mcp.yourapp.com/
```

Update Scalekit dashboard with production URL before deploying.

## Common issues

**Token validation fails**:
- Verify `SCALEKIT_RESOURCE_ID` matches dashboard
- Check `MCP_URL` has trailing slash
- Ensure environment variables are loaded (`load_dotenv()`)

**Discovery endpoint not found**:
- Confirm server is running on correct port
- Verify MCP client uses base URL + `/mcp` path
- Check firewall/network allows connections

**Scope errors persist**:
- Verify scopes are defined in Scalekit dashboard
- Check scope strings match exactly (case-sensitive)
- Ensure token was issued with required scopes

**MCP Inspector connection fails**:
- Leave auth fields empty (uses DCR)
- Check browser console for OAuth errors
- Verify server logs show authentication attempt

## Extending your server

### Adding new tools with scopes

```python
@mcp.tool
def new_operation(param: str) -> dict:
    """Your tool description."""
    error = _require_scope("your:scope")
    if error:
        return {"error": error}

    # Your implementation
    return {"result": "success"}
```

### Multiple scope requirements

```python
@mcp.tool
def sensitive_operation() -> dict:
    """Requires multiple scopes."""
    error = _require_scopes(["data:read", "data:write", "admin:access"])
    if error:
        return {"error": error}

    # Your implementation
    return {"result": "success"}
```

### Optional scope enhancement

```python
@mcp.tool
def flexible_operation() -> dict:
    """Returns different data based on scopes."""
    token: AccessToken = get_access_token()

    # Basic data for all authenticated users
    result = {"basic": "data"}

    # Enhanced data if user has admin scope
    if "admin:access" in token.scopes:
        result["admin"] = "enhanced_data"

    return result
```

## Complete Working Example

The complete FastMCP todo server shown above is available in the Scalekit MCP Auth Demos repository:

**GitHub Repository:** [scalekit-inc/mcp-auth-demos/tree/main/todo-fastmcp](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/todo-fastmcp)

This example demonstrates:
- Full CRUD operations with scope-based authorization
- In-memory todo storage for testing
- OAuth 2.1 integration via FastMCP ScalekitProvider
- Production-ready error handling and logging

## Resources

- Full example: [GitHub - todo-fastmcp](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/todo-fastmcp)
- [Scalekit MCP Auth Demos](https://github.com/scalekit-inc/mcp-auth-demos/tree/main)
- FastMCP docs: [fastmcp.dev](https://fastmcp.dev)
- Scalekit docs: [docs.scalekit.com/authenticate/mcp/fastmcp-quickstart](https://docs.scalekit.com/authenticate/mcp/fastmcp-quickstart)
- MCP Inspector: `npx @modelcontextprotocol/inspector@latest`
