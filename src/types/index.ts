export interface Environment {
  id: string;
  display_name?: string;
  domain?: string;
}

export interface AuthInfo {
  token: string;
  issuer: string;
  subject: string;
  clientId?: string;
  scopes?: string[] | string;
  claims?: Record<string, unknown>;
  selectedEnvironmentId?: string;
  selctEnvironmentDomain?: string;
}
