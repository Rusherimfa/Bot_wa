// Eksekusi 1 aksi RPG atas nama pemain (dipakai tombol, polling, digit).
import { loadChar } from '../commands/rpgchat.js';
import { sendRpgPoll } from './polls.js';

export async function runRpgAction(sock, jid, sender, cmdName, args, send, pushName = null) {
  const { rpgchat } = await import('../commands/rpgchat.js');
  const { chessCmd } = await import('../commands/chess.js');
  const cmd = [...rpgchat, ...chessCmd].find((x) => x.name === cmdName || (x.aliases || []).includes(cmdName));
  if (!cmd) return false;
  const name = pushName || sender.split('@')[0];
  const reply = (a, b, ex = {}) => (b === undefined ? send(jid, a, ex) : send(a, b, ex));
  await cmd.run({ jid, sender, pushName: name, args, raw: args.join(' '), m: { message: {} }, sock, send: reply });
  return true; // run tujuan sudah mengirim kartu/peta + polling via rpgTurnEnd
}
