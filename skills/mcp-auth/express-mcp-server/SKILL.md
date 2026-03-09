# Express.js MCP OAuth Authentication with Scalekit

## Overview

This skill documents the pattern for building production-ready MCP (Model Context Protocol) servers using Express.js, TypeScript, and OAuth 2.1 Bearer token authentication via Scalekit. This approach provides fine-grained control over HTTP request handling, middleware chains, and server behavior for Node.js-based MCP implementations.

## When to Use This Pattern

Use this Express.js MCP integration when you need:

- **Node.js ecosystem**: Leverage existing npm packages, TypeScript tooling, and JavaScript libraries
- **Custom middleware chains**: Implement rate limiting, request logging, or complex authorization logic with Express middleware
- **Existing Express applications**: Add MCP capabilities to established Express.js codebases without rewriting
- **Fine-grained HTTP control**: Manage routing, CORS policies, health checks, and multiple endpoints
- **Production flexibility**: Deploy on serverless platforms (AWS Lambda, Vercel), containers, or traditional Node.js hosts

**Don't use this pattern** if you prefer Python's ecosystem or if a simpler MCP server setup (without Express) meets your requirements.

## Core Architecture

### Token Validation Flow

```
MCP Client → Express Server (401 + WWW-Authenticate)
MCP Client → Scalekit (Exchange code for token)
Scalekit → MCP Client (Bearer token)
MCP Client → Express Server (POST /mcp + Bearer token)
Express Middleware → Scalekit SDK (Validate token)
McpServer → Tool Handler → Response
```

### Key Components

1. **Express Middleware**: Custom authentication middleware that intercepts requests and validates Bearer tokens before routing to MCP handlers
2. **Scalekit Node SDK**: TypeScript SDK validates JWT signatures, expiration, issuer, and audience claims
3. **McpServer**: Official MCP SDK server that handles protocol details (JSON-RPC, tool registration)
4. **StreamableHTTPServerTransport**: MCP transport layer that bridges Express HTTP requests to MCP protocol
5. **Zod Schema Validation**: Type-safe input validation for MCP tool parameters
6. **OAuth Resource Metadata Endpoint**: Well-known endpoint (`/.well-known/oauth-protected-resource`) for client discovery

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
- Add `.env` to `.gitignore` immediately
- Use secret managers in production (AWS Secrets Manager, Doppler, HashiCorp Vault)
- Rotate `SK_CLIENT_SECRET` regularly
- Validate `EXPECTED_AUDIENCE` matches your server's public URL exactly (including trailing slash)

### 2. Scalekit Client Initialization

```typescript
import { Scalekit } from '@scalekit-sdk/node';

const scalekit = new Scalekit(
  SK_ENV_URL,
  SK_CLIENT_ID,
  SK_CLIENT_SECRET
);
```

**Best practices:**
- Initialize once at module level for connection pooling
- SDK handles token caching and JWKS key rotation automatically
- All validation methods are async—always use await

### 3. MCP Server Setup

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'Greeting MCP',
  version: '1.0.0'
});

server.tool(
  'greet_user',
  'Greets the user with a personalized message.',
  {
    name: z.string().min(1, 'Name is required'),
  },
  async ({ name }: { name: string }) => ({
    content: [
      {
        type: 'text',
        text: `Hi ${name}, welcome to Scalekit!`
      }
    ]
  })
);
```

**Tool registration:**
- First parameter: Tool name (snake_case recommended for consistency)
- Second parameter: Human-readable description for AI discoverability
- Third parameter: Zod schema for input validation
- Fourth parameter: Async handler function

**Zod validation benefits:**
- Type-safe parameters with TypeScript inference
- Runtime validation prevents malformed inputs
- Automatic error messages for invalid data
- Composable schemas for complex validation rules

### 4. Express Middleware Authentication

```typescript
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Exempt public endpoints
  if (req.path === '/.well-known/oauth-protected-resource' || req.path === '/health') {
    next();
    return;
  }

  // Extract Bearer token
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : undefined;

  if (!token) {
    res.status(401)
      .set('WWW-Authenticate', WWW_HEADER_VALUE)
      .json({ error: 'Missing Bearer token' });
    return;
  }

  try {
    // Validate with Scalekit SDK
    await scalekit.validateToken(token, {
      audience: [EXPECTED_AUDIENCE]
    });
    next();
  } catch (error) {
    res.status(401)
      .set('WWW-Authenticate', WWW_HEADER_VALUE)
      .json({ error: 'Token validation failed' });
  }
});
```

**Key principles:**
- Use Express `app.use()` for middleware that runs on every request
- Explicitly exempt public endpoints before token extraction
- Return early with `return` after sending 401 responses (prevents "headers already sent" errors)
- Always set `WWW-Authenticate` header on 401 responses
- Use `next()` to pass control to subsequent middleware/routes

**Common mistake:** Forgetting to `return` after sending a response leads to "Cannot set headers after they are sent" errors.

### 5. MCP Transport Layer

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

app.post('/', async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  await server.connect(transport);

  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    res.status(500).json({ error: 'MCP transport error' });
  }
});
```

**Transport responsibilities:**
- Converts HTTP requests to MCP JSON-RPC format
- Handles streaming responses for long-running operations
- Manages session state (stateless when `sessionIdGenerator: undefined`)
- Bridges Express request/response objects to MCP protocol

**Stateless design:** Setting `sessionIdGenerator: undefined` ensures each request is independent—suitable for serverless deployments.

### 6. Resource Metadata Endpoint

```typescript
app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
  if (!PROTECTED_RESOURCE_METADATA) {
    res.status(500).json({ error: 'PROTECTED_RESOURCE_METADATA config missing' });
    return;
  }

  const metadata = JSON.parse(PROTECTED_RESOURCE_METADATA);
  res.type('application/json').send(JSON.stringify(metadata, null, 2));
});
```

**Purpose:**
- Enables MCP client discovery of authorization requirements
- Clients fetch this when they receive a 401 response with `WWW-Authenticate` header
- Contains authorization server endpoints, supported grant types, and token types
- Must be publicly accessible (no authentication required)

**Error handling:** Return 500 if metadata is missing to signal misconfiguration (deployment should fail fast).

### 7. CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: true,      // Allow all origins
  credentials: false // No credentials needed for Bearer tokens
}));
```

**Configuration options:**
- `origin: true`: Reflects request origin (development convenience)
- `origin: ['https://app.example.com']`: Whitelist specific origins (production)
- `credentials: false`: Bearer tokens don't require cookies/credentials
- `methods: ['GET', 'POST', 'OPTIONS']`: Limit allowed HTTP methods

**Production recommendation:** Use explicit origin whitelist instead of `origin: true`.

## Security Considerations

### Token Validation Requirements

- **Always validate issuer**: Prevents tokens from other OAuth servers being accepted
- **Always validate audience**: Ensures token was issued for your specific resource
- **Check expiration**: Scalekit SDK automatically validates `exp` claim
- **Verify signature**: SDK checks JWT signature against Scalekit's public keys (JWKS)

### Common Vulnerabilities to Avoid

1. **Skipping audience validation**: Tokens from other Scalekit resources could be used
2. **Custom JWT parsing**: Use SDK validation—don't implement manual `jwt.verify()`
3. **Logging tokens**: Never log Bearer tokens in middleware, error handlers, or debug output
4. **Missing CORS configuration**: Can enable cross-origin attacks or block legitimate clients
5. **Hardcoded secrets**: Use environment variables and secret managers
6. **Not returning after response**: Causes "headers already sent" errors and potential security issues

### Production Hardening

- **HTTPS termination**: Run behind reverse proxy (Nginx, Caddy, AWS ALB) with TLS
- **Process management**: Use PM2, systemd, or container orchestration for auto-restart
- **Multiple workers**: Use Node.js cluster module or container scaling
- **Rate limiting**: Implement per-client/token rate limits using `express-rate-limit`
- **Request logging**: Add structured logging middleware (Winston, Pino) without token values
- **Health checks**: Separate health endpoint for load balancers and orchestrators
- **Error monitoring**: Integrate Sentry, Datadog, or similar for production error tracking

## Testing Strategy

### Local Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```

**Testing workflow:**
1. Start your Express server: `npm run dev`
2. Launch MCP Inspector
3. Connect to `http://localhost:3002/`
4. Inspector automatically handles OAuth flow
5. Test each tool with various inputs
6. Verify middleware logs show successful validation

### Manual Token Testing with cURL

```bash
# Get token from Scalekit (via OAuth flow or test endpoint)
export TOKEN="<your-access-token>"

# Test authenticated MCP request
curl -X POST http://localhost:3002/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "greet_user",
      "arguments": {
        "name": "Saif"
      }
    }
  }'

# Test missing token (should return 401)
curl -v -X POST http://localhost:3002/

# Test invalid token
curl -X POST http://localhost:3002/ \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json"
```

### Integration Tests with Jest/Vitest

```typescript
import request from 'supertest';
import { app } from './server';

describe('MCP Authentication', () => {
  test('returns 401 without token', async () => {
    const response = await request(app).post('/');
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
  });

  test('returns 401 with invalid token', async () => {
    const response = await request(app)
      .post('/')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
  });

  test('health check is public', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'healthy' });
  });

  test('metadata endpoint is public', async () => {
    const response = await request(app).get('/.well-known/oauth-protected-resource');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
  });
});
```

**Test dependencies:**
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2"
  }
}
```

### Load Testing

```bash
# Install autocannon for HTTP load testing
npm install -g autocannon

# Test authenticated endpoint throughput
autocannon -c 10 -d 30 \
  -m POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -b '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:3002/
```

## Common Pitfalls

### 1. Mismatched Audience

**Symptom**: Tokens fail validation with "invalid audience" error
**Cause**: `EXPECTED_AUDIENCE` doesn't match the Server URL registered in Scalekit
**Fix**: Ensure both values are identical including protocol, host, port, and trailing slash

**Example:**
```typescript
// ❌ Wrong - missing trailing slash
EXPECTED_AUDIENCE=http://localhost:3002

// ✅ Correct - matches Scalekit registration
EXPECTED_AUDIENCE=http://localhost:3002/
```

### 2. Headers Already Sent Error

**Symptom**: `Error: Cannot set headers after they are sent to the client`
**Cause**: Forgetting to `return` after sending a response in middleware
**Fix**: Always `return` immediately after `res.json()` or `res.send()`

**Example:**
```typescript
// ❌ Wrong - continues to next middleware
if (!token) {
  res.status(401).json({ error: 'Missing token' });
}
next(); // This runs even after sending 401

// ✅ Correct - returns after response
if (!token) {
  res.status(401).json({ error: 'Missing token' });
  return; // Prevents calling next()
}
```

### 3. Middleware Order Issues

**Symptom**: CORS errors, authentication bypassed, or parsing failures
**Cause**: Middleware execution order matters in Express
**Fix**: Correct order is: CORS → body parsing → authentication → routes

**Example:**
```typescript
// ✅ Correct order
app.use(cors());
app.use(express.json());
app.use(authMiddleware);
app.get('/public', publicRoute);
app.post('/', protectedRoute);
```

### 4. Missing Resource Metadata

**Symptom**: Clients can't discover how to authenticate
**Cause**: `PROTECTED_RESOURCE_METADATA` not set or malformed JSON
**Fix**: Copy exact JSON from Scalekit dashboard, verify with `JSON.parse()`

**Debugging:**
```bash
# Test metadata endpoint
curl http://localhost:3002/.well-known/oauth-protected-resource

# Should return valid JSON with authorization_endpoint
```

### 5. TypeScript Module Resolution

**Symptom**: `Cannot find module '@modelcontextprotocol/sdk/server/mcp.js'`
**Cause**: Missing `.js` extension in ES module imports
**Fix**: Always include `.js` extension when importing from MCP SDK

**Example:**
```typescript
// ❌ Wrong - missing .js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

// ✅ Correct - includes .js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
```

### 6. Token Expiration During Testing

**Symptom**: Tests pass initially then fail after 1 hour
**Cause**: Access tokens expire (default 3600 seconds)
**Fix**: Implement token refresh before each test run or use shorter test cycles

## Extension Patterns

### Adding Scope-Based Authorization

```typescript
import jwt from 'jsonwebtoken';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      tokenPayload?: {
        sub: string;
        scope: string[];
      };
    }
  }
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  // ... existing token validation ...

  // Decode token to access claims (after validation)
  const decoded = jwt.decode(token) as any;
  req.tokenPayload = {
    sub: decoded.sub,
    scope: decoded.scope?.split(' ') || []
  };

  next();
});

// Tool with scope requirement
server.tool(
  'admin_action',
  'Performs an admin action',
  { action: z.string() },
  async ({ action }, { req }) => {
    if (!req.tokenPayload?.scope.includes('admin')) {
      throw new Error('Requires admin scope');
    }
    // ... admin logic ...
  }
);
```

### Multi-Tenancy Support

```typescript
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // ... validate token ...

  const decoded = jwt.decode(token) as any;
  req.orgId = decoded.org_id;

  next();
});

server.tool(
  'get_org_data',
  'Retrieves organization-specific data',
  {},
  async (_params, { req }) => {
    const orgId = req.orgId;
    const data = await fetchDataForOrg(orgId);

    return {
      content: [{ type: 'text', text: JSON.stringify(data) }]
    };
  }
);
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limit by token subject (user ID)
  keyGenerator: (req: Request) => {
    const token = req.headers.authorization?.slice('Bearer '.length);
    if (!token) return req.ip;

    const decoded = jwt.decode(token) as any;
    return decoded.sub || req.ip;
  }
});

// Apply to MCP endpoint
app.post('/', limiter, async (req: Request, res: Response) => {
  // ... MCP transport handling ...
});
```

### Structured Logging

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization'], // Never log tokens
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });

  next();
});
```

### Error Handling Middleware

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error');

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});
```

## Dependencies

### Required Packages

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "@scalekit-sdk/node": "^2.0.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^5.1.0",
    "zod": "^3.25.57"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.19",
    "tsx": "^4.7.0",
    "typescript": "^5.4.5"
  }
}
```

**Dependency purposes:**
- `@modelcontextprotocol/sdk`: Official MCP protocol implementation
- `@scalekit-sdk/node`: Scalekit authentication SDK for token validation
- `cors`: Cross-Origin Resource Sharing middleware
- `dotenv`: Environment variable loading from `.env` files
- `express`: Fast, unopinionated web framework
- `zod`: TypeScript-first schema validation
- `tsx`: TypeScript execution for development (faster than ts-node)
- `typescript`: TypeScript compiler

### Optional Production Dependencies

```json
{
  "dependencies": {
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "pino": "^8.17.2",
    "pino-http": "^9.0.0"
  }
}
```

**Production enhancements:**
- `express-rate-limit`: Rate limiting middleware
- `helmet`: Security headers middleware
- `pino`: High-performance JSON logger
- `pino-http`: HTTP request logging middleware

### Version Pinning Strategy

- Pin exact versions in production `package.json` (use `"express": "5.1.0"` not `"^5.1.0"`)
- Use `^` for development flexibility
- Run `npm audit` regularly for security vulnerabilities
- Test version upgrades in staging before production
- Use `npm ci` in production for reproducible builds

## Deployment Patterns

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3002

# Start server
CMD ["npm", "start"]
```

### PM2 Process Manager

```json
{
  "apps": [{
    "name": "mcp-server",
    "script": "dist/server.js",
    "instances": 4,
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production"
    }
  }]
}
```

**Start with PM2:**
```bash
npm run build
pm2 start ecosystem.config.json
```

### AWS Lambda (Serverless)

```typescript
import serverless from 'serverless-http';

// ... existing Express app setup ...

export const handler = serverless(app);
```

**Note:** Ensure stateless transport configuration for serverless environments.

### Environment-Specific Configuration

```typescript
const config = {
  development: {
    port: 3002,
    corsOrigin: true,
    logLevel: 'debug'
  },
  production: {
    port: parseInt(process.env.PORT || '3002'),
    corsOrigin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    logLevel: 'info'
  }
};

const env = process.env.NODE_ENV || 'development';
const appConfig = config[env];
```

## Complete Working Example

A full production-ready Express.js MCP server is available in the Scalekit MCP Auth Demos repository:

**GitHub Repository:** [scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-node](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-node)

This example includes:
- Complete server implementation with modular architecture
- OAuth 2.1 authentication middleware
- Tool registration with Zod validation
- CORS configuration and error handling
- Production-ready logging and monitoring

### Key Files

- `src/main.ts` - Main server entry point
- `src/lib/auth.ts` - OAuth discovery endpoint handler
- `src/lib/middleware.ts` - Token validation middleware
- `src/lib/transport.ts` - MCP transport layer setup
- `src/tools/` - Tool implementations

### Getting Started

```bash
cd greeting-mcp-node
npm install
npm run build
npm start
```

See [README.md](https://github.com/scalekit-inc/mcp-auth-demos/tree/main/greeting-mcp-node) for complete setup instructions.

## Related Resources

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Scalekit Node SDK](https://github.com/scalekit-inc/scalekit-sdk-node)
- [Zod Documentation](https://zod.dev/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Scalekit MCP Authentication Docs](https://docs.scalekit.com/guides/mcp/)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Scalekit MCP Auth Demos](https://github.com/scalekit-inc/mcp-auth-demos/tree/main)

## Changelog

- **2026-02-13**: Initial skill documentation based on Express.js MCP quickstart guide
