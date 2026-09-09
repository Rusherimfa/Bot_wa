// AIRich ala Danzz: render HTML apa pun jadi gambar PNG via Chrome headless.
// Pakai: const img = await aiRich(html); sock.sendMessage(jid, { image: img, caption });
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome-stable';

export async function aiRich(html, { width = 640, height = 640 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'airich-'));
  try {
    const file = path.join(dir, 'in.html');
    const out = path.join(dir, 'out.png');
    await fs.writeFile(file, html);
    await new Promise((resolve, reject) => {
      execFile(CHROME,
        ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
          `--window-size=${width},${height}`, `--screenshot=${out}`, file],
        { timeout: 25000 }, (err) => (err ? reject(err) : resolve()));
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
