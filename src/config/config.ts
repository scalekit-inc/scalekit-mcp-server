import dotenv from 'dotenv';

dotenv.config();

export const config = {
  host: process.env.HOST || '',
  port: Number(process.env.PORT) || '',
  authIssuer: process.env.AUTH_ISSUER || '',
  authServerId: process.env.AUTH_SERVER_ID || '',
  authAudience: process.env.AUTH_AUDIENCE || '',
  logLevel: process.env.LOG_LEVEL || 'info',
};
