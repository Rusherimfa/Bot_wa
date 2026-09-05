// Pengirim Inline WebUI — resep persis fondasi AzusaMD:
// botForwardedMessage.message.richResponseMessage + unifiedResponse.data base64
// + primitive GenAIaeacdsnwHtmlPrimitive(payload) + context forwarded AI Bot.
// Dikirim via relayMessage langsung (tanpa additionalNodes).
import { randomUUID } from 'crypto';
import { generateMessageID } from '@sairidev/baileys-new';

export async function sendInlineWebUI(sock, jid, htmlCode, title = 'WA Bot Full', opts = {}) {
  const uuid = randomUUID();
  const trusted = Array.isArray(opts.trustedSources) ? opts.trustedSources : [];
  const unifiedResponse = {
    response_id: uuid,
    sections: [{
      view_model: {
        primitive: {
          __typename: 'GenAIaeacdsnwHtmlPrimitive',
          payload: htmlCode,
          trusted_sources: trusted,
        },
        __typename: 'GenAISingleLayoutViewModel',
      },
    }],
  };
  const base64Data = Buffer.from(JSON.stringify(unifiedResponse), 'utf-8').toString('base64');
  const msg = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: { botResponseId: uuid },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 'AI_RICH_RESPONSE_TYPE_STANDARD',
          submessages: [{ messageType: 'AI_RICH_RESPONSE_TEXT', messageText: title }],
          unifiedResponse: { data: base64Data },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 'META_AI',
          },
        },
      },
    },
  };
  const messageId = generateMessageID();
  await sock.relayMessage(jid, msg, { messageId });
  return messageId;
}

// Kompat: pengirim AIRich lama dialihkan ke resep Azusa.
export async function sendAiRichHtml(sock, jid, { title = 'Game', html } = {}) {
  return sendInlineWebUI(sock, jid, html, title);
}

// Baca file game web + suntik base URL absolut + API key + token pemain,
// agar fetch skor tetap jalan dari dalam webview WA tanpa isi nomor.
export async function inlineGame(file, { token = '', mode = '' } = {}) {
  const fs = await import('fs');
  const { config, webBase } = await import('../core/config.js');
  let html = fs.readFileSync(new URL(`../web/${file}`, import.meta.url).pathname, 'utf8');
  const base = config.webPublic || webBase();
  html = html.split('/api/wa/score').join(`${base}/api/wa/score`);
  html = html.replace(/new URLSearchParams\(location\.search\)\.get\('key'\)\s*\|\|\s*''/g, `'${config.panelKey}'`);
  html = html.split(`'__PTOK__'`).join(`'${token}'`);
  if (mode) html = html.split(`'__MODE__'`).join(`'${mode}'`);
  return html;
}
