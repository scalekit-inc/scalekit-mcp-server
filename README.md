<p align="center">
  <a href="https://scalekit.com" target="_blank" rel="noopener noreferrer">
    <picture>
      <img src="https://cdn.scalekit.cloud/v1/scalekit-logo-dark.svg" height="64">
    </picture>
  </a>
</p>

<h1 align="center">
  Scalekit MCP Server
</h1>

<p align="center">
  <strong>Auth stack for AI apps ⚡ Official Scalekit MCP Server</strong>
</p>

<p align="center">
  <a href="https://github.com/scalekit-inc/scalekit-mcp-server/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://docs.scalekit.com/guides/mcp/overview"><img src="https://img.shields.io/badge/docs-MCP%20Guide-blue" alt="MCP Documentation"></a>
  <a href="https://mcp.scalekit.com"><img src="https://img.shields.io/badge/hosted-mcp.scalekit.com-green" alt="Hosted MCP Server"></a>
</p>

<p align="center">
  Official Model Context Protocol server for AI agents to interact with Scalekit's identity platform through natural language
</p>

## 🚀 What This MCP Server Enables

- **Natural Language Identity Management**: Manage users, organizations, and connections through AI conversations
- **OAuth-Protected Access**: Secure AI agent interactions with enterprise authentication
- **Comprehensive API Coverage**: Full access to Scalekit's identity and access management capabilities
- **Multi-Client Support**: Works with Claude Desktop, VS Code, Cursor, Windsurf, and other MCP clients

## Overview

This MCP server enables AI assistants to interact with Scalekit's identity and access management platform through a standardized set of tools. It provides secure, OAuth-protected access to manage environments, organizations, users, authentication connections, and more.

## Features

- Environment management and configuration
- Organization and user management
- Workspace member administration
- OIDC connection setup and management
- MCP server registration and configuration
- Role and scope management
- Admin portal link generation

## Configuration 

<table>
<tr><th>Using OAuth</th><th>Using mcp-remote proxy</th></tr>
<tr><th align=left colspan=2>VS Code (version 1.101 or greater)</th></tr>
<tr valign=top>
<td>
  
```json
{
  "servers": {
    "scalekit": {
      "type": "http",
      "url": "https://mcp.scalekit.com/"
    }
  }
}
```

</td>
<td>

```json
{
  "mcpServers": {
    "scalekit": {
      "command": "npx", 
      "args": ["-y", "mcp-remote", "https://mcp.scalekit.com/"]
    }
  }
}
```

</td>
</tr>
</table>

Based on your MCP Host, configuration instructions to add Scalekit as an MCP Server can be found below:


### Claude Desktop
  
Configure the Claude app to use the MCP server:

1. Open the Claude Desktop app, go to Settings, then Developer
2. Click Edit Config
3. Open the claude_desktop_config.json file
4. Copy and paste the server config to your existing file, then save
5. Restart Claude

```json
{
  "mcpServers": {
    "scalekit": {
      "command": "npx", 
      "args": ["-y", "mcp-remote", "https://mcp.scalekit.com/"]
    }
  }
}
```

### Cursor

Configure Cursor to use the MCP server:

1. Open Cursor, go to Settings, then Cursor Settings
2. Select MCP on the left
3. Click Add "New Global MCP Server" at the top right
4. Copy and paste the server config to your existing file, then save
5. Restart Cursor

```json
{
  "mcpServers": {
    "scalekit": {
      "command": "npx", 
      "args": ["-y", "mcp-remote", "https://mcp.scalekit.com/"]
    }
  }
}
```

### Windsurf

Configure Windsurf to use the MCP server:
 
1. Open Windsurf, go to Settings, then Developer
2. Click Edit Config
3. Open the windsurf_config.json file
4. Copy and paste the server config to your existing file, then save
5. Restart Windsurf


```json
{
  "mcpServers": {
    "scalekit": {
      "command": "npx", 
      "args": ["-y", "mcp-remote", "https://mcp.scalekit.com/"]
    }
  }
}
```

## Available Tools

### Environment Management

#### `list_environments`
- **Description**: List all available environments
- **Scopes**: Environment Read

#### `get_environment_details`
- **Description**: Get environment details by ID (e.g., env_123)
- **Parameters**: environmentId
- **Scopes**: Environment Read

#### `list_environment_roles`
- **Description**: List all roles in the specified environment
- **Parameters**: environmentId (format: env_<number>)
- **Scopes**: Environment Read

#### `create_environment_role`
- **Description**: Create a new role in the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - roleName
  - displayName
  - description
  - isDefault (boolean)
- **Scopes**: Environment Write

#### `list_environment_scopes`
- **Description**: List all scopes in the specified environment
- **Parameters**: environmentId (format: env_<number>)
- **Scopes**: Environment Read

#### `create_environment_scope`
- **Description**: Create a new scope in the specified environment
- **Parameters**:
  - environmentId (format: env_<number>)
  - scopeName
  - description
- **Scopes**: Environment Write

### Workspace Management

#### `list_workspace_members`
- **Description**: List all members in the current workspace
- **Parameters**: pageToken (1-based index)
- **Scopes**: Workspace Read

#### `invite_workspace_member`
- **Description**: Invite a new member to the current workspace
- **Parameters**: email
- **Scopes**: Workspace Write

### Organization Management

#### `list_organizations`
- **Description**: List all organizations under the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - pageToken
- **Scopes**: Organization Read

#### `get_organization_details`
- **Description**: Get details of an organization by ID (e.g., org_123)
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId
- **Scopes**: Organization Read

#### `create_organization`
- **Description**: Create a new organization under the specified environment
- **Parameters**: environmentId (format: env_<number>)
- **Scopes**: Organization Write

#### `generate_admin_portal_link`
- **Description**: Generate a magic link to the admin portal for the selected organization
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId (e.g., org_123)
- **Scopes**: Organization Write

#### `create_organization_user`
- **Description**: Create a new user in the selected organization
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId
  - email
  - externalId
  - firstName
  - lastName
  - metadata (JSON key-value pairs)
- **Scopes**: Organization Write

#### `list_organization_users`
- **Description**: List all users in the selected organization
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId
  - pageToken
- **Scopes**: Organization Read

#### `update_organization_settings`
- **Description**: Update the settings of an organization
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId
  - feature (JSON array of feature objects)
- **Scopes**: Organization Write

### Connection Management

#### `list_environment_connections`
- **Description**: List all connections for the specified environment
- **Parameters**: environmentId (format: env_<number>)
- **Scopes**: Environment Read

#### `list_organization_connections`
- **Description**: List all connections for the selected organization
- **Parameters**: 
  - environmentId (format: env_<number>)
  - organizationId (e.g., org_123)
- **Scopes**: Organization Read

#### `create_environment_oidc_connection`
- **Description**: Create a new OIDC connection for the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - provider (OKTA, GOOGLE, MICROSOFT_AD, AUTH0, ONELOGIN, PING_IDENTITY, JUMPCLOUD, CUSTOM, GITHUB, GITLAB, LINKEDIN, SALESFORCE, MICROSOFT, IDP_SIMULATOR, SCALEKIT, ADFS)
- **Scopes**: Environment Write

#### `update_environment_oidc_connection`
- **Description**: Update an existing OIDC connection for the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - connectionId (e.g., conn_123)
  - key_id
  - provider
  - oidc_config (comprehensive OIDC configuration object)
- **Scopes**: Environment Write

#### `enable_environment_connection`
- **Description**: Enable an existing connection for the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - connectionId (e.g., conn_123)
- **Scopes**: Environment Write

### MCP Server Management

#### `list_mcp_servers`
- **Description**: List all MCP servers in the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - pageToken
- **Scopes**: Environment Read

#### `register_mcp_server`
- **Description**: Register a new MCP server in the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - name
  - description
  - url
  - access_token_expiry (in seconds)
  - provider (optional, required when use_scalekit_authentication is false)
  - use_scalekit_authentication (boolean)
- **Scopes**: Environment Write

#### `update_mcp_server`
- **Description**: Update an existing MCP server in the specified environment
- **Parameters**: 
  - environmentId (format: env_<number>)
  - id (MCP server ID)
  - name (optional)
  - description (optional)
  - url (optional)
  - access_token_expiry (optional, in seconds)
  - provider (optional)
  - use_scalekit_authentication (optional boolean)
- **Scopes**: Environment Write

#### `switch_mcp_auth_to_scalekit`
- **Description**: Switch the authentication of an existing MCP server to Scalekit authentication
- **Parameters**: 
  - environmentId (format: env_<number>)
  - id (MCP server ID)
- **Scopes**: Environment Write

## Key Capabilities

- **Environment Management**: Create and configure Scalekit environments
- **Organization Operations**: Manage enterprise organizations and their settings  
- **User Administration**: Handle user lifecycle and permissions
- **Connection Management**: Configure SAML/OIDC identity provider connections
- **Workspace Administration**: Manage team members and roles
- **Portal Integration**: Generate admin portal links and manage access
- **MCP Server Registry**: Register and configure additional MCP servers

## Authentication & Security

Scalekit MCP server uses OAuth 2.1 for secure authentication. When you register the MCP server with your client, an OAuth authorization workflow ensures secure, token-based communication between your AI agent and Scalekit's platform.

## Additional Resources

  - 📚 [Scalekit Documentation](https://docs.scalekit.com)
  - 🔧 [API Reference](https://docs.scalekit.com/apis/)
  - 🚀 [Full Stack Auth Quickstart](https://docs.scalekit.com/fsa/quickstart/)
  - 💬 [Community Examples](https://github.com/orgs/scalekit-developers/repositories)
  - ⚡ [Model Context Protocol Spec](https://modelcontextprotocol.io)

> [!NOTE]
> Building your own OAuth-protected MCP server? Check out our [Auth for MCP Servers guide](https://docs.scalekit.com/guides/mcp/overview/) for implementation patterns.

---

<p align="center">
  Made with ❤️ by <a href="https://scalekit.com">Scalekit</a>
</p>

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/scalekit-inc-scalekit-mcp-server-badge.png)](https://mseep.ai/app/scalekit-inc-scalekit-mcp-server)

