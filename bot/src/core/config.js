import 'dotenv/config';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  prefixes: (process.env.PREFIXES || '!,.,/').split(','),
  ownerJid: (process.env.OWNER_JID || '').trim(),
  botName: process.env.BOT_NAME || 'WA Bot Full',
  tz: process.env.TZ || 'Asia/Makassar',
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  arenaApi: process.env.ARENA_API || 'http://localhost:3001/api/wa/arena',
  port: num(process.env.PORT, 3000),
  sendMin: num(process.env.SEND_MIN_DELAY, 3000),
  sendMax: num(process.env.SEND_MAX_DELAY, 8000),
  maxPerMinute: num(process.env.MAX_PER_MINUTE, 25),
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  ollamaUrl: (process.env.OLLAMA_URL || '').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  nineRouterUrl: process.env.NINE_ROUTER_URL || '',
  nineRouterKey: process.env.NINE_ROUTER_KEY || '',
  hermesWebhook: process.env.HERMES_WEBHOOK || '',
  panelPort: num(process.env.PANEL_PORT, 3000),
  panelKey: process.env.PANEL_API_KEY || '',
  // Base URL yang bisa dibuka HP (satu WiFi). Default localhost bila kosong.
  publicBase: (process.env.PUBLIC_BASE || 'http://127.0.0.1').replace(/\/$/, ''),
  // URL publik via tunnel (diisi otomatis oleh tunnels.sh). Prioritas tertinggi.
  arenaPublic: (process.env.ARENA_PUBLIC_URL || '').replace(/\/$/, ''),
  webPublic: (process.env.BOT_PUBLIC_URL || '').replace(/\/$/, ''),
};

export function arenaBase() {
  return config.arenaPublic || `${config.publicBase}:3001`;
}
export function webBase() {
  return config.webPublic || `${config.publicBase}:${config.panelPort}`;
}
