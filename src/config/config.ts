import dotenv from 'dotenv';

dotenv.config();

export const config = {
  serverName: 'Scalekit',
  serverVersion: '0.0.0',
  port: Number(process.env.PORT) || '',
  apiBaseUrl: process.env.API_BASE_URL || '',
  skApiBaseUrl: process.env.SK_API_BASE_URL || '',
  authIssuer: process.env.AUTH_ISSUER || '',
  authServerId: process.env.AUTH_SERVER_ID || '',
  authAudience: process.env.AUTH_AUDIENCE || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  mcpInspector: process.env.MCP_INSPECTOR || false,
};
