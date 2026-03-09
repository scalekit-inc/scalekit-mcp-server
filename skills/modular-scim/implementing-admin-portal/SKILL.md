---
name: implementing-admin-portal
description: Implements Scalekit's admin portal for customer self-serve SSO and SCIM configuration. Generates portal links server-side and embeds the portal as an iframe in the app's settings UI. Use when the user asks to add an admin portal, customer self-serve SCIM setup, iframe embed for directory sync config, shareable setup link, or let customers configure their own SSO or SCIM connection.
---

# Admin Portal with Scalekit

Adds a self-serve portal where customers configure their own SSO and SCIM settings — embedded inside your app's settings UI.

If the user only needs a quick shareable link with no code (e.g., for a one-time onboarding call), skip to the **Shareable link** section at the bottom.

---

## Implementation progress

```
Admin Portal Implementation Progress:
- [ ] Step 1: Install SDK
- [ ] Step 2: Set environment credentials
- [ ] Step 3: Register app domain in dashboard
- [ ] Step 4: Generate portal link (server-side)
- [ ] Step 5: Render iframe (client-side)
- [ ] Step 6: Handle session expiry events
- [ ] Step 7: Verify portal loads and events fire correctly
```

---

## Step 1: Install SDK

Detect the project's language/framework from existing files and install:

| Stack   | Install |
|---------|---------|
| Node.js | `npm install @scalekit-sdk/node` |
| Python  | `pip install scalekit-sdk` |
| Go      | `go get github.com/scalekit/scalekit-go` |
| Java    | Add `com.scalekit:scalekit-sdk` to `pom.xml` |

---

## Step 2: Set environment credentials

Add to `.env` (never hardcode):

```shell
SCALEKIT_ENVIRONMENT_URL='https://<your-env>.scalekit.com'
SCALEKIT_CLIENT_ID='<CLIENT_ID>'
SCALEKIT_CLIENT_SECRET='<CLIENT_SECRET>'
```

Credentials are in **Dashboard > Developers > Settings > API Credentials**.

---

## Step 3: Register app domain

In **Dashboard > Developers > API Configuration > Redirect URIs**, add the domain where the portal will be embedded. The iframe will be blocked if this is missing.

---

## Step 4: Generate the portal link (server-side)

Generate a new link on every page load — links are single-use. Plug into the existing route or controller that serves the settings/admin page:

**Node.js:**
```javascript
const { location } = await scalekit.organization.generatePortalLink(organizationId);
// Pass `location` to the frontend as a template variable or API response
```

**Python:**
```python
portal = scalekit_client.organization.generate_portal_link(organization_id)
location = portal.location
# Pass `location` to your template or JSON response
```

**Never cache this value** — each link is single-use and will fail if reused.

---

## Step 5: Render the iframe (client-side)

In the frontend settings/admin template, inject `location` as the `src`:

```html
<iframe
  src="{{ portalLink }}"
  width="100%"
  height="600px"
  frameborder="0"
  allow="clipboard-write"
></iframe>
```

Minimum recommended height: **600px**. Match the variable name to the project's existing templating convention.

---

## Step 6: Handle portal UI events

Listen for messages from the iframe to react to configuration changes and session expiry:

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== process.env.SCALEKIT_ENVIRONMENT_URL) return;

  const { type } = event.data;
  switch (type) {
    case 'SCIM_CONFIGURED':
      // Refresh org SCIM status, show success banner, etc.
      break;
    case 'SSO_CONFIGURED':
      // Refresh org SSO status if SSO is also in scope
      break;
    case 'SESSION_EXPIRED':
      // Re-fetch a new portal link and reload the iframe src
      reloadPortalIframe();
      break;
  }
});
```

`SESSION_EXPIRED` handling is required — without it the portal silently breaks for long-lived sessions.

---

## Step 7: Verify

- [ ] Open the settings page — confirm the iframe renders without console errors
- [ ] Complete a test SCIM configuration inside the portal — confirm `SCIM_CONFIGURED` fires
- [ ] Wait for session expiry (or simulate it) — confirm `SESSION_EXPIRED` triggers a link refresh
- [ ] Confirm portal link is never the same across two page loads (single-use verification)

---

## Branding (optional)

Configure at **Dashboard > Settings > Branding**: logo, accent color, favicon. Custom domain support (e.g., `scim.yourapp.com`) is available in the Scalekit dashboard.

---

## Guardrails

- **Generate link server-side only** — never expose `CLIENT_SECRET` to the browser
- **Re-generate on every page load** — caching will break the portal
- **Register your domain** in Redirect URIs before testing or the iframe will be blocked
- **Handle `SESSION_EXPIRED`** — re-generate and reload, don't let it fail silently

---

## Shareable link (no-code alternative)

For one-time onboarding calls or zero-engineering setup: go to **Dashboard > Organizations**, select the org, click **Generate link**, and share the URL directly. The link gives anyone who has it full access to configure that org's SSO/SCIM settings — use the iframe approach for production. Also share Scalekit's [SCIM setup guides](https://docs.scalekit.com/guides/integrations/scim-integrations/) so the IT admin has provider-specific directory sync steps alongside the portal link.
