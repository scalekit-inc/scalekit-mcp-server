const Entity = {
  workspace: 'wks',  
  environment: 'env',
  organization: 'org',
}
const ACTION = {
  read: 'read',
  write: 'write',
}

export const SCOPES = {
  workspaceRead: `${Entity.workspace}:${ACTION.read}`,
  workspaceWrite: `${Entity.workspace}:${ACTION.write}`,
  environmentRead: `${Entity.environment}:${ACTION.read}`,
  environmentWrite: `${Entity.environment}:${ACTION.write}`,
  organizationRead: `${Entity.organization}:${ACTION.read}`,
  organizationWrite: `${Entity.organization}:${ACTION.write}`,
};

export function getAllScopes(): string[] {
    return Object.values(SCOPES);
}