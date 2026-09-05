import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'dev'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export const log = {
  info: (...a) => console.log('ℹ️', ...a),
  ok: (...a) => console.log('✅', ...a),
  warn: (...a) => console.log('⚠️', ...a),
  err: (...a) => console.log('❌', ...a),
};
