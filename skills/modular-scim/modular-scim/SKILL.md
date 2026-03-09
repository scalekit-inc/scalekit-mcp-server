---
name: implementing-scim-provisioning
description: Implements SCIM user provisioning using Scalekit's Directory API and webhooks. Use when the user asks to add SCIM, directory sync, user provisioning, deprovisioning, or lifecycle management to their existing application.
---

# SCIM Provisioning with Scalekit

Adds automated user lifecycle management (create, update, deactivate) via Scalekit's Directory API and real-time webhooks.

## Workflow

Copy and track progress:

```
SCIM Implementation Progress:
- [ ] Step 1: Detect stack and install SDK
- [ ] Step 2: Configure environment credentials
- [ ] Step 3: Initialize Scalekit client
- [ ] Step 4: Add Directory API sync (polling/on-demand)
- [ ] Step 5: Add webhook endpoint (real-time)
- [ ] Step 6: Register webhook in Scalekit dashboard
- [ ] Step 7: Map directory events to local user operations
- [ ] Step 8: Validate end-to-end
```

---

## Step 1: Detect stack and install SDK

Detect the project's language/framework from existing files (`package.json`, `requirements.txt`, `go.mod`, `pom.xml`) and install accordingly:

| Stack | Install command |
|-------|----------------|
| Node.js | `npm install @scalekit-sdk/node` |
| Python | `pip install scalekit-sdk` |
| Go | `go get github.com/scalekit/scalekit-go` |
| Java | Add `com.scalekit:scalekit-sdk` to `pom.xml` or `build.gradle` |

---

## Step 2: Environment credentials

Add to `.env` (never hardcode):

```shell
SCALEKIT_ENVIRONMENT_URL='https://<your-env>.scalekit.com'
SCALEKIT_CLIENT_ID='<CLIENT_ID>'
SCALEKIT_CLIENT_SECRET='<CLIENT_SECRET>'
SCALEKIT_WEBHOOK_SECRET='<WEBHOOK_SECRET>'
```

Credentials are found in **Dashboard > Developers > Settings > API Credentials**.
Webhook secret is found in **Dashboard > Webhooks** after registering an endpoint.

---

## Step 3: Initialize the Scalekit client

Insert initialization near the app's startup or service layer — match the project's existing patterns (singleton, DI, module export, etc.).

**Node.js:**
```javascript
import { ScalekitClient } from '@scalekit-sdk/node';
const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENVIRONMENT_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);
```

**Python:**
```python
from scalekit import ScalekitClient
scalekit_client = ScalekitClient(
    env_url=os.getenv("SCALEKIT_ENVIRONMENT_URL"),
    client_id=os.getenv("SCALEKIT_CLIENT_ID"),
    client_secret=os.getenv("SCALEKIT_CLIENT_SECRET")
)
```

For Go and Java patterns, see [REFERENCE.md](REFERENCE.md).

---

## Step 4: Directory API (on-demand sync)

Use for scheduled jobs, onboarding flows, or bulk imports. Integrate into existing user service/repository layer — do not create a parallel user management path.

**Fetch users and sync:**

```javascript
// Node.js
const { directory } = await scalekit.directory.getPrimaryDirectoryByOrganizationId(orgId);
const { users } = await scalekit.directory.listDirectoryUsers(orgId, directory.id);

for (const user of users) {
  await upsertUser({ email: user.email, name: user.name, orgId });
}
```

```python
# Python
directory = scalekit_client.directory.get_primary_directory_by_organization_id(org_id)
users = scalekit_client.directory.list_directory_users(org_id, directory.id)

for user in users:
    upsert_user(email=user.email, name=user.name, org_id=org_id)
```

**Group sync for RBAC:**

```javascript
const { groups } = await scalekit.directory.listDirectoryGroups(orgId, directory.id);
for (const group of groups) {
  await syncGroupPermissions(group.id, group.name);
}
```

Plug `upsertUser` / `syncGroupPermissions` into the project's **existing** user/role management functions — identify them by searching for `createUser`, `updateUser`, or equivalent patterns in the codebase.

---

## Step 5: Webhook endpoint (real-time provisioning)

Add a new route to the existing HTTP server/router. Match the framework pattern already in use (Express, FastAPI, Spring Boot, net/http, etc.).

**ALWAYS verify the signature before processing. Return 400 on failure.**

**Node.js (Express):**
```javascript
app.post('/webhooks/scalekit', async (req, res) => {
  try {
    await scalekit.verifyWebhookPayload(
      process.env.SCALEKIT_WEBHOOK_SECRET,
      req.headers,
      req.body
    );
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const { type, data } = req.body;
  try {
    await handleDirectoryEvent(type, data);
    res.status(201).json({ status: 'processed' });
  } catch (err) {
    res.status(500).json({ error: 'Processing failed' });
  }
});
```

**Python (FastAPI):**
```python
@app.post("/webhooks/scalekit")
async def scalekit_webhook(request: Request):
    body = await request.json()
    valid = scalekit_client.verify_webhook_payload(
        secret=os.getenv("SCALEKIT_WEBHOOK_SECRET"),
        headers=request.headers,
        payload=json.dumps(body).encode()
    )
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid signature")

    await handle_directory_event(body.get("type"), body.get("data", {}))
    return JSONResponse(status_code=201, content={"status": "processed"})
```

For Go and Java, see [REFERENCE.md](REFERENCE.md).

---

## Step 6: Event handler

Create a single dispatcher that routes to existing user operations. Map events to the project's **existing** create/update/deactivate functions:

```javascript
async function handleDirectoryEvent(type, data) {
  switch (type) {
    case 'organization.directory.user_created':
      return createUser(data.email, data.name, data.organization_id);
    case 'organization.directory.user_updated':
      return updateUser(data.email, data.name);
    case 'organization.directory.user_deleted':
      return deactivateUser(data.email); // prefer deactivate over hard delete
    case 'organization.directory.group_created':
    case 'organization.directory.group_updated':
      return syncGroup(data);
    default:
      console.log(`Unhandled event: ${type}`);
  }
}
```

**Prefer deactivation over deletion** for `user_deleted` events unless the project explicitly hard-deletes users.

---

## Step 7: Dashboard registration checklist

After deploying the webhook endpoint:

1. Go to **Dashboard > Webhooks > +Add Endpoint**
2. Enter the public HTTPS URL: `https://your-app.com/webhooks/scalekit`
3. Subscribe to events:
   - `organization.directory.user_created`
   - `organization.directory.user_updated`
   - `organization.directory.user_deleted`
   - `organization.directory.group_created`
   - `organization.directory.group_updated`
4. Copy the webhook secret into `SCALEKIT_WEBHOOK_SECRET`
5. Share the [SCIM setup guide](https://docs.scalekit.com/guides/integrations/scim-integrations/) with the customer's IT admin for their IdP-specific directory sync steps.

---

## Guardrails

- **Never hardcode credentials** — always `process.env` / `os.getenv` / `System.getenv`
- **Idempotent operations** — `upsertUser` must handle duplicate events safely
- **Return 2xx quickly** — offload heavy processing to a queue if needed; Scalekit retries on non-2xx with exponential backoff (up to 8 attempts over ~10 hours)
- **Validate signatures** — every webhook request, every time
- **Deactivate, don't delete** — unless codebase explicitly hard-deletes users

---

## Reference files

- Full Go/Java SDK examples → [REFERENCE.md](REFERENCE.md)
- Webhook event payload schemas → [EVENTS.md](EVENTS.md)
- RBAC group-to-role mapping patterns → [RBAC.md](RBAC.md)
