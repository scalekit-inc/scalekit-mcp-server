export interface DetailedEnvironment {
  environment: Environment;
  organizations: Organization[];

}

export interface ListOrganizationsResponse {
  next_page_token: string;
  total_size: number;
  organizations: Organization[];
  prev_page_token: string;
}

export interface GetOrganizationResponse {
  organization: Organization;
}

export interface Organization {
  id: string;
  external_id?: string;
  display_name?: string;
  settings?: OrganizationSettings;
}

export interface OrganizationSettings {
  features: Feature[],
}

export interface Environment {
  id: string;
  display_name?: string;
  domain?: string;
  type?: string;
  custom_domain?: string;
  custom_domain_status?: string;
}

export interface ListMembersResponse {
  next_page_token: string;
  members: Member[];
}

export interface CreateMemberResponse {
  member: Member;
}

export interface Member {
  id: string;
  email: string;
  organizations: MemberOrganization[];
}

export interface MemberOrganization {
  organization_id: string;
  membership_status: string;
}

export interface Feature {
  name: string;
  enabled: boolean;
}

export interface AuthInfo {
  token: string;
  issuer: string;
  subject: string;
  clientId?: string;
  scopes?: string[] | string;
  claims?: Record<string, unknown>;
  selectedEnvironmentId?: string;
  selectedEnvironmentDomain?: string;
}

export interface Connection {
  id: string;
  provider: string;
  type: string;
  status: string;
  enabled: boolean;
  organization_id: string;
  ui_button_title: string;
  domains: string[];
  organization_name: string;
}

export interface ListConnectionsResponse {
  connections: Connection[];
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  default: boolean;
}

export interface Link {
  id: string;
  location: string;
  expire_time: string;
}

export interface GenerateAdminPortalLinkResponse {
  link: Link;
}

export interface ListUsersResponse {
  next_page_token: string;
  total_size: number;
  users: User[];
  prev_page_token: string;
}

export interface User {
  id: string;
  environment_id: string;
  create_time: string;
  update_time: string;
  email: string;
  external_id: string;
  memberships: UserMembership[];
  user_profile: UserProfile;
  metadata: Record<string, unknown>;
}

export interface UserMembership {
  organization_id: string;
  membership_status: string;
  roles: UserRole[];
  name: string;
  primary_identity_provider: string;
  metadata: Record<string, unknown>;
}

export interface UserRole {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  locale: string;
  email_verified: boolean;
  phone_number: string;
  metadata: Record<string, unknown>;
  custom_attributes: Record<string, unknown>;
}

export interface Scope {
  name: string;
  description: string;
}

export interface ListResourcesResponse {
  total_size: number;
  next_page_token: string;
  resources: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  resource_id: string;
  description: string;
  resource_type: string;
  third_party: boolean;
  disable_dynamic_client_registration: boolean;
  logo_uri: string;
  access_token_expiry: string;
  refresh_token_expiry: string;
  create_time: string;
  update_time: string;
}


