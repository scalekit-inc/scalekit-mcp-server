---
name: building-agent-mcp-server
description: Guides developers through creating a Scalekit MCP server with authenticated tool access. Use when building an MCP server, exposing Scalekit tools over MCP, or connecting AI agents via LangChain/LangGraph MCP adapters.
---

# Building an Agent MCP Server

Scalekit lets you build MCP servers that manage authentication, create personalized access URLs for users, and define which tools are accessible. You can also bundle several toolkits (e.g., Gmail + Google Calendar) within a single server.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) is an open-source standard that enables AI systems to interface with external tools and data sources. Where the `integrating-agent-auth` skill uses the SDK directly, this workflow exposes Scalekit tools over the MCP protocol so any compliant client — LangChain, Claude Desktop, MCP Inspector — can consume them.

> **Note:** Agent Auth MCP servers only support Streamable HTTP transport.

## What you'll build

1. A Scalekit MCP server that fetches the user's latest email and creates a reminder calendar event
2. A LangGraph agent that connects to this server via `langchain-mcp-adapters` and invokes the tools

## Prerequisites

- [ ] **Scalekit credentials**: [app.scalekit.com](https://app.scalekit.com) → Settings → Copy `SCALEKIT_CLIENT_ID`, `SCALEKIT_CLIENT_SECRET`, `SCALEKIT_ENV_URL`
- [ ] **OpenAI API key**: `OPENAI_API_KEY`

> **Gmail is the only connector that does not require dashboard setup.** All other connectors (including Google Calendar) must be created in the Scalekit Dashboard before use:
>
> Go to **Scalekit Dashboard → Agent Auth → Connections → + Create Connection → Select connector** → Set `Connection Name` → Save

> **Important**: The **Connection Name** you set in the dashboard is exactly what you use as the `connection_name` parameter in your code. They must match exactly.

For this example, create the Google Calendar connector:
- [ ] **Google Calendar connector**: Scalekit Dashboard → Agent Auth → Connections → Create Connection → Google Calendar → `Connection Name = MY_CALENDAR` → Save

## Step 1 — Set up your environment

Install dependencies:

```bash
pip install scalekit-sdk-python langgraph>=0.6.5 langchain-mcp-adapters>=0.1.9 python-dotenv>=1.0.1 openai>=1.53.0 requests>=2.32.3
```

Add these imports to `main.py`:

```python
import os
import asyncio
from dotenv import load_dotenv
import scalekit.client
from scalekit.actions.models.mcp_config import McpConfigConnectionToolMapping
from scalekit.actions.types import GetMcpInstanceAuthStateResponse
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
```

Set the OpenAI key in your environment:

```bash
export OPENAI_API_KEY=xxxxxx
```

Initialize the Scalekit client:

```python
load_dotenv()

scalekit = scalekit.client.ScalekitClient(
    client_id=os.getenv("SCALEKIT_CLIENT_ID"),
    client_secret=os.getenv("SCALEKIT_CLIENT_SECRET"),
    env_url=os.getenv("SCALEKIT_ENV_URL"),
)
my_mcp = scalekit.actions.mcp
```

## Step 2 — Create an MCP config and server instance

Define the MCP config with `connection_tool_mappings` — each entry maps a connector to the tools it exposes:

```python
cfg_response = my_mcp.create_config(
    name="reminder-manager",
    description="Summarizes latest email and creates a reminder event",
    connection_tool_mappings=[
        # Gmail works directly — no dashboard setup required
        McpConfigConnectionToolMapping(
            connection_name="gmail",
            tools=[
                "gmail_fetch_mails",
            ],
        ),
        # Google Calendar must be created in dashboard first
        McpConfigConnectionToolMapping(
            connection_name="MY_CALENDAR",
            tools=[
                "googlecalendar_create_event",
            ],
        ),
    ],
)
config_name = cfg_response.config.name
```

Create a server instance for a specific user (`john-doe`). Each user gets their own instance URL:

```python
inst_response = my_mcp.ensure_instance(
    config_name=config_name,
    user_identifier="john-doe",
)
mcp_url = inst_response.instance.url
print("Instance URL:", mcp_url)
```

## Step 3 — Authenticate the user

Retrieve auth state and print any OAuth links the user needs to visit:

```python
auth_state_response = my_mcp.get_instance_auth_state(
    instance_id=inst_response.instance.id,
    include_auth_links=True,
)
for conn in getattr(auth_state_response, "connections", []):
    print(
        "Connection:", conn.connection_name,
        " Provider:", conn.provider,
        " Auth Link:", conn.authentication_link,
        " Status:", conn.connected_account_status,
    )
```

> **Note:** Open every printed auth link in a browser and complete OAuth before proceeding to Step 4.

## Step 4 — Connect and invoke via MCP

Use `MultiServerMCPClient` with `streamable_http` transport, load the tools, and run the agent:

```python
async def main():
    client = MultiServerMCPClient(
        {
            "reminder_demo": {
                "transport": "streamable_http",
                "url": mcp_url,
            },
        }
    )
    tools = await client.get_tools()
    agent = create_react_agent("openai:gpt-4.1", tools)
    response = await agent.ainvoke(
        {"messages": "get 1 latest email and create a calendar reminder event in next 15 mins for a duration of 15 mins."}
    )
    print(response)

asyncio.run(main())
```

> **Note — MCP client compatibility:** You can test this MCP server with popular clients like MCP Inspector, Claude Desktop, and other spec-compliant implementations. Note that ChatGPT's beta connector feature may not work properly as it's still in beta and doesn't fully adhere to the MCP specification yet.

Full working example: [github.com/scalekit-inc/python-connect-demos/tree/main/mcp](https://github.com/scalekit-inc/python-connect-demos/tree/main/mcp)
