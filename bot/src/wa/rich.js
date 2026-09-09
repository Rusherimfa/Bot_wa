// MessageBuilder ala Danzz: satu pintu untuk pesan kaya (rich).
// Kunci render: relay dengan additionalNodes biz/bot (tanpanya tombol terkirim tapi tak tampil).
import { proto, generateWAMessageFromContent, isJidGroup } from '@sairidev/baileys-new';

const PRIVACY_TS_OFFSET = 77980457;
const privacyTs = () => String(Math.floor(Date.now() / 1000) - PRIVACY_TS_OFFSET);

function bizNode() {
  return {
    tag: 'biz',
    attrs: { actual_actors: '2', host_storage: '2', privacy_mode_ts: privacyTs() },
    content: [
      { tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
}
const botNode = { tag: 'bot', attrs: { biz_bot: '1' } };

async function relayInteractive(sock, jid, interactiveMessage) {
  const userJid = sock.user?.id;
  const waMsg = generateWAMessageFromContent(jid, { interactiveMessage }, { userJid });
  const nodes = isJidGroup(jid) ? [bizNode()] : [botNode, bizNode()];
  await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id, additionalNodes: nodes });
  return waMsg.key.id;
}

const NF = (name, params) => ({ name, buttonParamsJson: JSON.stringify(params) });

// GAMBAR + TOMBOL dalam 1 bubble (image header + classic buttons).
// rows: [{title, id}] maks 3. Ini format utama game bubble chat.
export async function richBubble(sock, jid, image, caption, rows, footer = 'WA Bot Full', extra = {}) {
  return sock.sendMessage(jid, {
    image, caption, footer,
    buttons: rows.slice(0, 3).map((r) => ({ buttonId: r.id, buttonText: { displayText: r.title }, type: 1 })),
    ...extra,
  });
}

// Tombol klasik buttonsMessage (format tertua, peluang render terluas).
// rows: [{title, id}] maks 3.
export async function richClassicButtons(sock, jid, text, rows, footer = 'WA Bot Full', extra = {}) {
  return sock.sendMessage(jid, {
    text, footer,
    buttons: rows.slice(0, 3).map((r) => ({ buttonId: r.id, buttonText: { displayText: r.title }, type: 1 })),
    ...extra,
  });
}

// Tombol ketuk cepat (maks 3).
export async function richQuickReply(sock, jid, text, buttons, footer = 'WA Bot Full') {
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: buttons.slice(0, 3).map((b) =>
        proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create(
          NF('quick_reply', { display_text: b.label, id: b.id }))),
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
  });
  return relayInteractive(sock, jid, interactiveMessage);
}

// Daftar pilihan single-select (opsi tak terbatas).
export async function richButtons(sock, jid, text, rows, footer = 'WA Bot Full') {
  if (rows.length <= 3 && rows.every((r) => !r.description)) {
    return richQuickReply(sock, jid, text, rows, footer);
  }
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create(
        NF('single_select', {
          title: 'PILIH',
          sections: [{ title: 'Opsi', rows: rows.slice(0, 10).map((r) => ({ title: r.title, id: r.id, description: r.description || '' })) }],
        }))],
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
  });
  return relayInteractive(sock, jid, interactiveMessage);
}

// Tombol URL besar; webview=true -> buka di webview dalam WA (jalur "HTML view").
export async function richUrl(sock, jid, text, label, url, footer = 'WA Bot Full', webview = true) {
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create(
        NF('cta_url', { display_text: label, url, merchant_url: url, ...(webview ? { webview_interaction: 1 } : {}) }))],
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
  });
  return relayInteractive(sock, jid, interactiveMessage);
}

export async function richText(sock, jid, text, footer = 'WA Bot Full') {
  return sock.sendMessage(jid, { text, footer });
}

export async function richImage(sock, jid, image, caption, footer = 'WA Bot Full') {
  return sock.sendMessage(jid, { image, caption, footer });
}

// Gambar + daftar pilihan menempel (pola DENIA menuStyle 2: image header + single-select).
export async function richImageButtons(sock, jid, image, caption, rows, footer = 'WA Bot Full') {
  return sock.sendMessage(jid, {
    image, caption, footer,
    nativeFlow: [{
      text: 'PILIH',
      sections: [{ title: 'Opsi', rows: rows.slice(0, 10).map((r) => ({ title: r.title, id: r.id, description: r.description || '' })) }],
    }],
  });
}

// Gambar + tombol URL menempel (pola DENIA menuStyle 3: image header + CTA).
export async function richImageUrl(sock, jid, image, caption, label, url, footer = 'WA Bot Full') {
  return sock.sendMessage(jid, {
    image, caption, footer,
    nativeFlow: [{ text: label, url, useWebview: true }],
  });
}
