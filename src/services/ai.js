// Otak AI gratis: prioritas 9Router -> Hermes webhook -> Ollama -> Gemini -> mock.
import axios from 'axios';
import { config } from '../core/config.js';

export async function aiChat(prompt, ctx = []) {
  const messages = [...ctx, { role: 'user', content: prompt }].slice(-10);

  // 1. 9Router (multi-model, hemat)
  if (config.nineRouterUrl) {
    try {
      const { data } = await axios.post(config.nineRouterUrl, { messages },
        { headers: { Authorization: `Bearer ${config.nineRouterKey}` }, timeout: 30000 });
      const txt = data?.choices?.[0]?.message?.content;
      if (txt) return txt;
    } catch (e) { console.log('⚠️ 9router:', e.message); }
  }
  // 2. Hermes agent lokal
  if (config.hermesWebhook) {
    try {
      const { data } = await axios.post(config.hermesWebhook, { prompt, messages }, { timeout: 30000 });
      if (data?.reply || data?.text) return data.reply || data.text;
    } catch (e) { console.log('⚠️ hermes:', e.message); }
  }
  // 3. Ollama lokal (llama3.1 / qwen)
  if (config.ollamaUrl) {
    try {
      const { data } = await axios.post(`${config.ollamaUrl}/api/chat`,
        { model: config.ollamaModel, messages, stream: false }, { timeout: 120000 });
      if (data?.message?.content) return data.message.content;
    } catch (e) { console.log('⚠️ ollama:', e.message); }
  }
  // 4. Gemini free-tier
  if (config.geminiKey) {
    try {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 30000 });
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return txt;
    } catch (e) { console.log('⚠️ gemini:', e.message); }
  }
  // 5. Mock offline (tetap berguna tanpa internet/key)
  return `Mode lokal aktif (tanpa API key).\nKamu bilang: "${prompt}"\n\nIsi GEMINI_API_KEY / OLLAMA_URL / NINE_ROUTER_URL di .env untuk jawaban AI yang sebenarnya.`;
}

export async function aiImage(prompt) {
  // Pollinations gratis, tanpa key
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true`;
  return url;
}
