import { z } from 'zod';

/** Reusable schema for environment ID (env_...) - use in tool input schemas. */
export const environmentIdSchema = z
  .string()
  .regex(/^env_\w+$/, 'Environment ID must start with env_');

/** Reusable schema for organization ID (org_...) - use in tool input schemas. */
export const organizationIdSchema = z
  .string()
  .regex(/^org_\w+$/, 'Organization ID must start with org_');

/** Reusable schema for connection ID (conn_...) */
export const connectionIdSchema = z
  .string()
  .regex(/^conn_\w+$/, 'Connection ID must start with conn_');

/** Reusable schema for resource ID (app_...) */
export const resourceIdSchema = z
  .string()
  .regex(/^app_\w+$/, 'Resource ID must start with app_');

/** OIDC provider enum - use in connection tools. */
export const OIDC_PROVIDERS = [
  'OKTA', 'GOOGLE', 'MICROSOFT_AD', 'AUTH0', 'ONELOGIN', 'PING_IDENTITY',
  'JUMPCLOUD', 'CUSTOM', 'GITHUB', 'GITLAB', 'LINKEDIN', 'SALESFORCE',
  'MICROSOFT', 'IDP_SIMULATOR', 'SCALEKIT', 'ADFS',
] as const;

export const oidcProviderSchema = z.enum(OIDC_PROVIDERS);

/*
 We are not able to put the validation in tool input schema itself because stricter clients like Gemini CLI doesn't treat email and urls as valid input types.
 Hence we have to accept them as strings and validate them here.
 */

export function validateEmail(email: string) {
    const emailSchema = z.string().email();
    const result = emailSchema.safeParse(email);
    if (result.success) {
        return null;
    } else {
        return `Invalid email passed ${email}`;
    }
}

export function validateUrls(urls: string[]) {
    const urlSchema = z.string().url();
    const invalidUrls = urls.filter(url => !urlSchema.safeParse(url).success);
    if (invalidUrls.length === 0) {
        return null;
    } else {
        return  `Invalid URL(s) passed: ${invalidUrls.join(', ')}`;
    }
}