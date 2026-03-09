---
name: modular-sso
description: Implements complete SSO and authentication flows using Scalekit. Handles modular SSO, IdP-initiated login, user session management, and enterprise customer onboarding. Use when adding authentication, SSO, SAML, OIDC, or user login to applications.
---

# Implement SSO as a Modular

## Quick Start

**Choose your authentication mode:**
- **Modular SSO**: You manage users and sessions (covered here)
- **Full-Stack Auth**: Scalekit manages users and sessions (built-in SSO)

This skill covers Modular SSO for applications with existing user management.

## Implementation Workflow

Copy this checklist and track progress:

```
Authentication Integration Progress:
- [ ] Step 1: Configure Modular Auth mode
- [ ] Step 2: Install and configure Scalekit SDK
- [ ] Step 3: Implement authorization URL generation
- [ ] Step 4: Handle IdP-initiated SSO (RECOMMENDED)
- [ ] Step 5: Process authentication callback
- [ ] Step 6: Validate tokens and extract user profile
- [ ] Step 7: Test SSO integration
- [ ] Step 8: Set up customer onboarding flow
```

## Step 1: Configure Modular Auth Mode

**Action**: Configure environment for Modular SSO:
1. Navigate to Dashboard > Authentication > General
2. Under "Full-Stack Auth" section, click "Disable Full-Stack Auth"

**Result**: System ready for modular integration.

## Step 2: Install and Configure SDK

### Installation

Choose the SDK for the project's tech stack:

**Node.js:**
```bash
npm install @scalekit-sdk/node
```

**Python:**
```bash
pip install scalekit-sdk-python
```

**Go:**
```bash
go get github.com/scalekit-inc/scalekit-sdk-go
```

**Java:**
```xml
<dependency>
  <groupId>com.scalekit</groupId>
  <artifactId>scalekit-sdk-java</artifactId>
</dependency>
```

### Environment Configuration

Add these credentials to `.env` file (fetch from Dashboard > Developers > Settings > API credentials):

```env
SCALEKIT_ENVIRONMENT_URL=<environment-url>
SCALEKIT_CLIENT_ID=<client-id>
SCALEKIT_CLIENT_SECRET=<client-secret>
```

---

## Step 3: Generate Authorization URL

Create authorization URL to redirect users to their identity provider.

### SSO Connection Selectors (Priority Order)

Use ONE of these identifiers (evaluated in precedence order):

1. **connectionId** (highest) - Direct SSO connection reference
2. **organizationId** - Routes to organization's active SSO
3. **loginHint** - Extracts domain from email to find connection

### Implementation Pattern

**Node.js:**
```javascript
const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENVIRONMENT_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);

const options = {
  organizationId: 'org_15421144869927830',  // OR
  connectionId: 'conn_15696105471768821',   // OR
  loginHint: 'user@example.com'
};

const authUrl = scalekit.getAuthorizationUrl(
  'https://yourapp.com/auth/callback',
  options
);

// Redirect user to authUrl
```

**Python:**
```python
from scalekit import ScalekitClient, AuthorizationUrlOptions

scalekit = ScalekitClient(
    os.getenv('SCALEKIT_ENVIRONMENT_URL'),
    os.getenv('SCALEKIT_CLIENT_ID'),
    os.getenv('SCALEKIT_CLIENT_SECRET')
)

options = AuthorizationUrlOptions()
options.organization_id = 'org_15421144869927830'

auth_url = scalekit.get_authorization_url(
    redirect_uri='https://yourapp.com/auth/callback',
    options=options
)
```

**Direct URL (no SDK):**
```
<SCALEKIT_ENVIRONMENT_URL>/oauth/authorize?
  response_type=code&
  client_id=<CLIENT_ID>&
  redirect_uri=<CALLBACK_URL>&
  scope=openid profile email&
  organization_id=<ORG_ID>
```

## Step 4: Handle IdP-Initiated SSO

**CRITICAL**: Implement this to support users who start login from their identity provider portal.

### Why This Matters

IdP-initiated SSO converts potentially insecure flows into secure SP-initiated flows, protecting against SAML assertion theft and replay attacks.

### Configuration Required

1. Set initiate login endpoint: Dashboard > Authentication > Redirects
2. Configure endpoint: `https://yourapp.com/login`

### Implementation

**Node.js:**
```javascript
app.get('/login', async (req, res) => {
  const { idp_initiated_login, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({ message: error_description });
  }

  if (idp_initiated_login) {
    // Decode JWT to extract connection details
    const claims = await scalekit.getIdpInitiatedLoginClaims(idp_initiated_login);

    const options = {
      connectionId: claims.connection_id,
      organizationId: claims.organization_id,
      loginHint: claims.login_hint,
      state: claims.relay_state
    };

    const authUrl = scalekit.getAuthorizationUrl(
      'https://yourapp.com/auth/callback',
      options
    );

    return res.redirect(authUrl);
  }

  // Handle normal login flow
});
```

**Python:**
```python
@app.route('/login')
async def handle_login():
    idp_initiated_login = request.args.get('idp_initiated_login')
    error = request.args.get('error')

    if error:
        return {'error': request.args.get('error_description')}, 400

    if idp_initiated_login:
        claims = await scalekit.get_idp_initiated_login_claims(idp_initiated_login)

        options = AuthorizationUrlOptions()
        options.connection_id = claims.get('connection_id')
        options.organization_id = claims.get('organization_id')
        options.state = claims.get('relay_state')

        auth_url = scalekit.get_authorization_url(
            redirect_uri='https://yourapp.com/auth/callback',
            options=options
        )

        return redirect(auth_url)
```

---

## Step 5: Process Authentication Callback

Handle the callback after successful IdP authentication.

### Callback Endpoint Setup

1. Create endpoint: `/auth/callback`
2. Register in Dashboard > Authentication > Redirect URLs > Allowed Callback URLs

### Implementation

**Node.js:**
```javascript
app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({ error: error_description });
  }

  try {
    // Exchange code for user profile and tokens
    const result = await scalekit.authenticateWithCode(
      code,
      'https://yourapp.com/auth/callback'
    );

    // Extract user information
    const userEmail = result.user.email;
    const userName = result.user.givenName + ' ' + result.user.familyName;
    const userId = result.user.id;

    // Create session for authenticated user
    req.session.user = {
      id: userId,
      email: userEmail,
      name: userName
    };

    res.redirect('/dashboard');
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});
```

**Python:**
```python
@app.route('/auth/callback')
async def auth_callback():
    code = request.args.get('code')
    error = request.args.get('error')

    if error:
        return {'error': request.args.get('error_description')}, 400

    result = scalekit.authenticate_with_code(
        code,
        'https://yourapp.com/auth/callback'
    )

    # Create session
    session['user'] = {
        'id': result.user.id,
        'email': result.user.email,
        'name': f"{result.user.given_name} {result.user.family_name}"
    }

    return redirect('/dashboard')
```

---

## Step 6: Validate Tokens

**ALWAYS** validate tokens before trusting claims.

**Node.js:**
```javascript
// Validate ID token
const idTokenClaims = await scalekit.validateToken(result.idToken);

// Validate access token
const accessTokenClaims = await scalekit.validateToken(result.accessToken);
```

**Python:**
```python
id_token_claims = scalekit.validate_token(result['id_token'])
access_token_claims = scalekit.validate_token(result['access_token'])
```

### Token Structure

**ID Token includes:**
- `email`: User's email address
- `given_name`, `family_name`: User's name
- `sub`: Unique user identifier (format: `connectionId;userId`)
- `oid`: Organization ID
- `amr`: Authentication method (SSO connection ID)

**Access Token includes:**
- `sub`: User identifier
- `exp`: Expiration timestamp
- `client_id`: Your application client ID

## Step 7: Test SSO Integration

Use the built-in IdP Simulator for comprehensive testing.

### Test Organization Setup

Your environment includes pre-configured test organization with domains:
- `@example.com`
- `@example.org`

### Testing Workflow

1. **Find test organization**: Dashboard > Organizations
2. **Use test selector**: Pass one of these in authorization URL:
   - Email with `@example.com` domain
   - Test organization's connection ID
   - Organization ID
3. **Simulate SSO flow**: IdP Simulator appears (mimics customer's IdP)
4. **Complete authentication**: Enter test credentials
5. **Verify callback**: Check user profile received correctly

### Test Scenarios

Test ALL three scenarios:
1. **SP-initiated SSO**: User starts login from your app
2. **IdP-initiated SSO**: User starts from IdP portal
3. **Domain-based routing**: User enters email, auto-routes to IdP

---

## Step 8: Customer Onboarding

Enable SSO for enterprise customers through self-service Admin Portal.

### Quick Onboarding

**Create organization**: Dashboard > Organizations > New Organization

**Generate portal link** (Node.js):
```javascript
const portalLink = await scalekit.organization.generatePortalLink(
  'org_32656XXXXXX0438'
);

// Share this link with customer's IT admin
console.log('Admin Portal:', portalLink.location);
```

**Share link**: Send to customer's IT administrator via email/Slack

**Share setup guide**: Include the Scalekit [SSO setup guide](https://docs.scalekit.com/guides/integrations/sso-integrations/) — provider-specific steps for Okta, Azure AD, Google Workspace, and others.

### Embedded Portal (Advanced)

Embed Admin Portal in your app for seamless experience:

```javascript
// Backend: Generate portal link
const portalLink = await scalekit.organization.generatePortalLink(orgId);
res.json({ portalUrl: portalLink.location });
```

```html
<!-- Frontend: Embed in iframe -->
<iframe
  src="${portalUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-write">
</iframe>
```
## Advanced Patterns

### Pre-Check SSO Availability

Prevent failed redirects by checking SSO configuration before redirecting:

**Node.js:**
```javascript
const domain = email.split('@').toLowerCase(); [reddit](https://www.reddit.com/r/ClaudeAI/comments/1qb1024/ultimate_claude_skillmd_autobuilds_any_fullstack/)

const connections = await scalekit.connections.listConnectionsByDomain({
  domain
});

if (connections.length > 0) {
  // SSO available - redirect to IdP
  const authUrl = scalekit.getAuthorizationUrl(redirectUri, {
    domainHint: domain
  });
  return res.redirect(authUrl);
} else {
  // No SSO - show password login
  return showPasswordLogin();
}
```

### Domain Verification

Enable seamless routing by verifying customer domains:
1. Customer verifies domain (e.g., `@megacorp.org`) in Admin Portal
2. Users sign in without organization selection
3. Scalekit auto-routes based on email domain

### Session Management Best Practices

**Set secure session configuration:**
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,        // HTTPS only
    httpOnly: true,      // Prevent XSS
    maxAge: 86400000,    // 24 hours
    sameSite: 'lax'      // CSRF protection
  }
}));
```

**Implement session refresh:**
```javascript
// Check token expiration
if (Date.now() / 1000 > accessTokenClaims.exp) {
  // Redirect to re-authentication
  return res.redirect('/login');
}
```

## Integration with Existing Auth Systems

### Auth0 Integration

Configure Scalekit as Custom Social Connection in Auth0:
1. Auth0 Dashboard > Authentication > Social > Create Connection
2. Use Scalekit OAuth2 endpoints
3. Map Scalekit user attributes to Auth0 profile

### Firebase Integration

Add Scalekit as Custom Auth Provider:
1. Use Firebase Custom Token generation
2. Exchange Scalekit tokens for Firebase tokens
3. Maintain session with Firebase SDK

### AWS Cognito Integration

Configure Scalekit as SAML Identity Provider:
1. Cognito User Pool > Identity Providers > SAML
2. Use Scalekit metadata URL
3. Map attributes to Cognito user attributes

## Security Checklist

Before production deployment, verify:

- [ ] Environment variables stored securely (never in code)
- [ ] HTTPS enforced on all endpoints
- [ ] Tokens validated before trusting claims
- [ ] Session cookies use `secure` and `httpOnly` flags
- [ ] CSRF protection enabled
- [ ] Callback URLs registered in Scalekit dashboard
- [ ] Error messages don't expose sensitive information
- [ ] Rate limiting implemented on auth endpoints
- [ ] Logging configured (without exposing tokens)

## Troubleshooting

### "Invalid redirect_uri" Error

**Cause**: Callback URL not registered in dashboard
**Fix**: Add URL to Dashboard > Authentication > Redirect URLs

### "Organization not found" Error

**Cause**: Invalid organization ID or user doesn't belong to organization
**Fix**: Verify organization ID and user's email domain

### IdP-Initiated SSO Not Working

**Cause**: Initiate login URL not configured
**Fix**: Set URL in Dashboard > Authentication > Redirects

### Token Validation Fails

**Cause**: Token expired or invalid signature
**Fix**: Check token expiration and environment URL configuration

## Common Patterns

### Multi-Tenant Architecture

```javascript
// Determine organization from subdomain
const subdomain = req.hostname.split('.');
const organization = await getOrganizationBySubdomain(subdomain);

const authUrl = scalekit.getAuthorizationUrl(redirectUri, {
  organizationId: organization.scalekitOrgId
});
```

### Step-Up Authentication

```javascript
// Require re-authentication for sensitive operations
if (requiresStepUp && !session.recentAuth) {
  return res.redirect('/auth/step-up');
}
```

### Logout Implementation

```javascript
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});
```

## Reference

**Scalekit Dashboard**: [https://app.scalekit.com](https://app.scalekit.com)

**Connection Selector Precedence**: connectionId > organizationId > loginHint

**Token Expiration**: ID tokens expire in 15 minutes, access tokens in 24 hours

**Admin Portal Events**: Listen for `sso.enabled`, `sso.disabled`, `session.expired`

**Support**: [docs.scalekit.com](https://docs.scalekit.com)

## Implementation Notes

**Always validate tokens**: Never trust token claims without validation

**Handle errors gracefully**: Show user-friendly messages, log details internally

**Test all scenarios**: SP-initiated, IdP-initiated, and domain-based routing

**Enable domain verification**: Provides best user experience

**Use progressive enhancement**: Start with basic SSO, add advanced features iteratively

**Monitor authentication flows**: Track success rates and common failure points
```