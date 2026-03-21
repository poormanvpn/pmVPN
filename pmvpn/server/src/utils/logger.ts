// Structured logging via pino
// MIT License

import pino from 'pino';

export const logger = pino({
  name: 'pmvpn',
  level: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
});
