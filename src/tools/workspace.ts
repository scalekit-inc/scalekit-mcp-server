import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ENDPOINTS } from '../types/endpoints.js';
import { AuthInfo, CreateMemberResponse, ListMembersResponse } from '../types/index.js';
import { TOOLS } from './index.js';

export function registerWorkspaceTools(server: McpServer){
    TOOLS.list_workspace_members.registeredTool = listWorkspaceMembers(server)
    TOOLS.invite_workspace_member.registeredTool = inviteWorkspaceMember(server);
}

function listWorkspaceMembers(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.list_workspace_members.name,
        TOOLS.list_workspace_members.description,
        {
            pageToken: z.number().optional().default(1),
        },
        async ({ pageToken }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            try {
                const pageSize = 500;
                if (pageToken == 0){
                    pageToken = 1; // Ensure pageToken starts at 1
                }
                const params = new URLSearchParams({
                    page_size: String(pageSize),
                    page_token: String(pageToken ?? '1')
                });
                const res = await fetch(`${ENDPOINTS.workspaces.listMembers}?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = (await res.json()) as ListMembersResponse;

                const membersList = data.members.map(member => {
                    const status = member.organizations?.[0]?.membership_status || 'UNKNOWN';
                    return `Workspace Member ${member.email} in ${status} status`;
                }).join(', ') || 'No members found.';

                return {
                    content: [
                        {
                            type: 'text',
                            text: membersList + "Next Page Token: " + (data.next_page_token ?? '1'),
                        },
                    ]
                };
            } catch {
                logger.error(`Failed to fetch workspace members`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to fetch workspace members. Please check try again later.',
                        },
                    ],
                };
            }
        }
    );
}

function inviteWorkspaceMember(server: McpServer): RegisteredTool {
    return server.tool(
        TOOLS.invite_workspace_member.name,
        TOOLS.invite_workspace_member.description,
        {
            email: z.string().email('Invalid email format').min(1, 'Email is required'),
        },
        async ({ email }, context) => {
            const authInfo = context.authInfo as AuthInfo;
            const token = authInfo?.token;

            try {
                const res = await fetch(`${ENDPOINTS.workspaces.inviteMember}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: email,
                        role: 'ADMIN',
                    }),
                });
                if (res.status > 399 && res.status < 500) {
                    const errorData = await res.json();
                    const errorMessage = typeof errorData === 'object' && errorData !== null && 'message' in errorData
                        ? (errorData as { message: string }).message
                        : 'Unknown error';
                    logger.error(`Failed to invite workspace member: ${errorMessage}. if the user already exist then check if the user has accepted the invitation.`);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to invite workspace member: ${errorMessage}`,
                            },
                        ],
                    };
                }
                const data = (await res.json()) as CreateMemberResponse;

                const member = `Workspace Member ${data.member.email} invited.`;

                return {
                    content: [
                        {
                            type: 'text',
                            text: member,
                        },
                    ],
                };
            } catch {
                logger.error(`Failed to invite workspace members`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Failed to invite workspace members. Please check try again later.',
                        },
                    ],
                };
            }
        }
    );
}


