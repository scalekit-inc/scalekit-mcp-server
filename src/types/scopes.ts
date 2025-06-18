const Entity = {
    environment: 'env',
    organization: 'org',
}
export const SCOPES = {
  environmentRead: `${Entity.environment}:read`,
  organizationWrite: `${Entity.organization}:write`,
};
