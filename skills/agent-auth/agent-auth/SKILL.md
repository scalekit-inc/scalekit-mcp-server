---
name: integrating-agent-auth
description: Integrates Scalekit Agent Auth into a project to handle OAuth flows, token storage, and automatic refresh for third-party services (Gmail, Slack, Notion, Calendar). Use when a user needs to connect to an external service, authorize OAuth access, fetch access or refresh tokens, or execute API calls on behalf of a user.
---

# Agent Auth Integration

Scalekit handles the full OAuth lifecycle — authorization, token storage, and refresh — so agents can act on behalf of users in Gmail, Slack, Notion, Calendar, and other connectors.

**Required env vars**: `SCALEKIT_CLIENT_ID`, `SCALEKIT_CLIENT_SECRET`, `SCALEKIT_ENV_URL`
→ Get from [app.scalekit.com](https://app.scalekit.com): Developers → Settings → API Credentials

## Setup

Install the SDK and initialize the client:

> **Important**: Except for Gmail, all connectors must be configured in the Scalekit Dashboard first before creating authorization URLs.
>
> To set up a connector: **Scalekit Dashboard → Agent Auth → Connections → + Create Connection → Select connector → Set Connection Name → Save**

<tabs>

**Python**
```bash
pip install scalekit-sdk-python
```
```python
import scalekit.client, os
from dotenv import load_dotenv
load_dotenv()

scalekit = scalekit.client.ScalekitClient(
    client_id=os.getenv("SCALEKIT_CLIENT_ID"),
    client_secret=os.getenv("SCALEKIT_CLIENT_SECRET"),
    env_url=os.getenv("SCALEKIT_ENV_URL"),
)
actions = scalekit.actions
```

**Node.js**
```bash
npm install @scalekit-sdk/node@2.2.0-beta.1
```
```typescript
import { ScalekitClient } from '@scalekit-sdk/node';
import 'dotenv/config';

const scalekitClient = new ScalekitClient(
  process.env.SCALEKIT_ENV_URL!,
  process.env.SCALEKIT_CLIENT_ID!,
  process.env.SCALEKIT_CLIENT_SECRET!
);
const { connectedAccounts } = scalekitClient;
```

</tabs>

## Connector setup

Before integrating with a connector, follow these steps in the Scalekit Dashboard:

> **Gmail is the only connector that does not require dashboard setup.** Skip this section for Gmail.

For all other connectors (Slack, Notion, Google Calendar, etc.):

1. Go to **Scalekit Dashboard → Agent Auth → Connections**
2. Click **+ Create Connection**
3. Select the connector you want to use
4. Enter a **Connection Name** (e.g., `MY_SLACK`, `MY_NOTION`)
5. Click **Save**

> **Important**: The **Connection Name** you set in the dashboard is exactly what you use as the `connection_name` parameter in your code. They must match exactly.

## Integration workflow

**First, ask the user:**

> Are you starting fresh and want a quick test with Gmail, or are you integrating directly into your project?

- If **fresh / quick test**: Use the Gmail example below (Gmail is the only connector that doesn't require dashboard setup)
- If **integrating directly**: Create your connector in the Scalekit Dashboard first, then adapt the workflow below to your connector

Copy this checklist and check off steps as you complete them:

```
Agent Auth Integration Progress:
- [ ] Step 1: SDK installed and client initialized
- [ ] Step 2: Connected account created for the user
- [ ] Step 3: User has authorized the connection (status = ACTIVE)
- [ ] Step 4: Access token fetched successfully
- [ ] Step 5: Downstream API call succeeds with fetched token
```

### Step 1 — Create a connected account

Replace `"user_123"` with the project's actual user ID. Replace `"gmail"` with the target connector.

**Python**
```python
response = actions.get_or_create_connected_account(
    connection_name="gmail",
    identifier="user_123"
)
connected_account = response.connected_account
```

**Node.js**
```typescript
const response = await connectedAccounts.getOrCreateConnectedAccount({
  connector: 'gmail',
  identifier: 'user_123',
});
const connectedAccount = response.connectedAccount;
```

### Step 2 — Authorize the user

If status is not `ACTIVE`, the user must complete OAuth. In a web app, redirect to `link`. In CLI/dev, print and wait.

**Python**
```python
if connected_account.status != "ACTIVE":
    link_response = actions.get_authorization_link(
        connection_name="gmail",
        identifier="user_123"
    )
    print("Authorize here:", link_response.link)
    input("Press Enter after authorizing...")
```

**Node.js**
```typescript
if (connectedAccount?.status !== 'ACTIVE') {
  const linkResponse = await connectedAccounts.getMagicLinkForConnectedAccount({
    connector: 'gmail',
    identifier: 'user_123',
  });
  console.log('Authorize here:', linkResponse.link);
  // Web app: redirect user to linkResponse.link
}
```

### Step 3 — Fetch OAuth tokens

ALWAYS call `get_connected_account` immediately before any API call — Scalekit auto-refreshes tokens and this guarantees the latest valid token.

**Python**
```python
response = actions.get_connected_account(
    connection_name="gmail",
    identifier="user_123"
)
tokens = response.connected_account.authorization_details["oauth_token"]
access_token = tokens["access_token"]
refresh_token = tokens["refresh_token"]
```

**Node.js**
```typescript
const accountResponse = await connectedAccounts.getConnectedAccountByIdentifier({
  connector: 'gmail',
  identifier: 'user@example.com',
});
const authDetails = accountResponse?.connectedAccount?.authorizationDetails;
const accessToken = authDetails?.details?.case === 'oauthToken'
  ? authDetails.details.value?.accessToken : undefined;
const refreshToken = authDetails?.details?.case === 'oauthToken'
  ? authDetails.details.value?.refreshToken : undefined;
```

### Step 4 — Call the third-party API

Use `access_token` from Step 3 as a Bearer token. Example: fetch 5 unread Gmail messages.

**Python**
```python
import requests

headers = {"Authorization": f"Bearer {access_token}"}
list_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"

messages = requests.get(
    list_url, headers=headers, params={"q": "is:unread", "maxResults": 5}
).json().get("messages", [])

for msg in messages:
    data = requests.get(
        f"{list_url}/{msg['id']}", headers=headers,
        params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]}
    ).json()
    hdrs = data.get("payload", {}).get("headers", [])
    print(next((h["value"] for h in hdrs if h["name"] == "Subject"), "No Subject"))
    print(next((h["value"] for h in hdrs if h["name"] == "From"), "Unknown"))
    print(data.get("snippet", ""))
    print("-" * 50)
```

**Node.js**
```typescript
const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const params = new URLSearchParams({ q: 'is:unread', maxResults: '5' });

const { messages = [] } = await fetch(`${listUrl}?${params}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
}).then(r => r.json());

for (const msg of messages) {
  const msgData = await fetch(
    `${listUrl}/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then(r => r.json());

  const h = msgData.payload?.headers ?? [];
  console.log('Subject:', h.find(x => x.name === 'Subject')?.value ?? 'No Subject');
  console.log('From:', h.find(x => x.name === 'From')?.value ?? 'Unknown');
  console.log('Snippet:', msgData.snippet ?? '');
  console.log('-'.repeat(50));
}
```

## Adapting to other connectors

Replace `"gmail"` with any supported connector name: `slack`, `notion`, `calendar`, etc.
The SDK workflow (Steps 1–3) is identical for all connectors. Only the downstream API call (Step 4) changes.

For connector-specific API details, see [CONNECTORS.md](CONNECTORS.md).

## Building agents

Use Scalekit tools with AI frameworks to build agents that can execute actions on behalf of users.

### LangChain agents

Create conversational agents with LangChain that can autonomously call Scalekit tools based on user intent.

**Python**
```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate

# Fetch tools from Scalekit in LangChain format
tools = actions.langchain.get_tools(
    identifier="user_123",
    providers=["GMAIL"],
    page_size=100
)

# Define the agent prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant with access to external tools."),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# Create and run the agent
llm = ChatOpenAI(model="gpt-4o")
agent = create_openai_tools_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
result = executor.invoke({"input": "fetch my last 5 unread emails and summarize them"})
```

### Google ADK agents

Build agents using Google's Agent Development Kit with native Gemini integration.

**Python**
```python
from google.adk.agents import Agent

# Fetch tools from Scalekit in Google ADK format
gmail_tools = actions.google.get_tools(
    providers=["GMAIL"],
    identifier="user_123",
    page_size=100
)

# Create the agent
agent = Agent(
    name="gmail_assistant",
    model="gemini-2.5-flash",
    description="Gmail assistant that can read and manage emails",
    instruction="You are a helpful Gmail assistant that can read, send, and organize emails.",
    tools=gmail_tools
)

# Run the agent
response = agent.process_request("fetch my last 5 unread emails and summarize them")
```

For more examples and framework-specific patterns, see [code-samples.md](../references/code-samples.md).

## Deep reference

For comprehensive documentation on connected accounts lifecycle, states, and API usage, see [connected-accounts.md](../references/connected-accounts.md).

For code samples and implementation examples by framework, see [code-samples.md](../references/code-samples.md).

For an overview of supported providers and their capabilities, see [providers.md](../references/providers.md).

For comprehensive token management including refresh, security, and monitoring, see [token-management.md](../references/token-management.md).

For configuring your own OAuth credentials per connector (whitelabeling, dedicated quotas), see [byoc.md](../references/byoc.md).
