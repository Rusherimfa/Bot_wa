export const store = [
  {
    name: 'katalog', aliases: ['produk', 'shop'], desc: 'Lihat katalog',
    async run({ send }) {
      const { db } = await import('../core/store.js');
      if (!db.products.length) return send('Katalog masih kosong.');
      await send('*KATALOG*\n' + db.products.map((p) => `${p.id}. ${p.name} - Rp${p.price} (stok ${p.stock})`).join('\n') + '\n\nCara order: !order <id> <jumlah>');
    },
  },
  {
    name: 'tambahproduk', desc: '!tambahproduk Nama | harga | stok (owner)',
    ownerOnly: true,
    async run({ raw, send }) {
      const { db } = await import('../core/store.js');
      const [name, price, stock] = raw.split('|').map((s) => s.trim());
      if (!name || !price) return send('Format: !tambahproduk Kopi | 15000 | 10');
      const p = await db.addProduct({ name, price: Number(price), stock: Number(stock) || 0 });
      await send(`Produk ditambahkan: ${p.name} (id ${p.id})`);
    },
  },
  {
    name: 'order', desc: '!order <id> <jumlah>',
    async run({ jid, sender, args, send }) {
      const { db } = await import('../core/store.js');
      const p = db.products.find((x) => String(x.id) === String(args[0]));
      if (!p) return send('Produk tidak ditemukan. Cek !katalog');
      const qty = Number(args[1]) || 1;
      if (p.stock < qty) return send(jid, 'Stok tidak mencukupi.');
      await db.setStock(p.id, p.stock - qty);
      const o = await db.addOrder({ customer: sender, items: [{ id: p.id, name: p.name, qty, price: p.price }], total: p.price * qty });
      await send(jid, `*ORDER #${o.id}*\n${p.name} x${qty} = Rp${o.total}\nStatus: pending. Cek dengan !cekorder ${o.id}`);
    },
  },
  {
    name: 'cekorder', desc: '!cekorder <id>',
    async run({ args, send }) {
      const { db } = await import('../core/store.js');
      const o = await db.getOrder(args[0]);
      if (!o) return send('Order tidak ditemukan.');
      await send(`*ORDER #${o.id}*\nTotal: Rp${o.total}\nStatus: ${o.status}`);
    },
  },
  {
    name: 'kasir', aliases: ['omset'], desc: 'Rekap omset (owner)',
    ownerOnly: true,
    async run({ send }) {
      const { db } = await import('../core/store.js');
      const total = db.orders.reduce((a, o) => a + o.total, 0);
      await send(`*REKAP*\nOmset: Rp${total}\nJumlah order: ${db.orders.length}`);
    },
  },
  {
    name: 'stok', desc: '!stok <id> <jumlah> (owner)', ownerOnly: true,
    async run({ args, send }) {
      const { db } = await import('../core/store.js');
      const p = db.products.find((x) => String(x.id) === String(args[0]));
      if (!p) return send('Produk tidak ditemukan.');
      await db.setStock(p.id, Number(args[1]));
      await send(`Stok ${p.name} diubah menjadi ${args[1]}`);
    },
  },
];
