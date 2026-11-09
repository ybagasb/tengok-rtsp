// Snapshot adopsi PIC & pengisian data Divisi 2 (READ-ONLY) -> scripts/slides-data/adopsi.json
// Dipakai scripts/make_slides.py untuk slide rekap adopsi.
//
// Jalankan: node --env-file=.env.local scripts/adopsi_snapshot.mjs
// Definisi:
//   PIC terdaftar  = Location.picSubs tidak kosong
//   Sudah mengisi  = Location.sectionUpdates punya >= 1 dimensi yang pernah disimpan
//   Adopsi lengkap = keduanya terpenuhi
// Cakupan JIAT = Location kategori 'jiat' (Divisi 2). Irigasi/DIR sengaja TIDAK dihitung.
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI tidak ada (pakai --env-file=.env.local)'); process.exit(1); }
await mongoose.connect(uri);
const db = mongoose.connection.db;

const CAT_LABEL = {
  jiat: 'PL Irigasi & JIAT', irigasi: 'Irigasi', bendungan: 'Bendungan', 'sungai-pantai': 'Sungai Pantai',
  bencana: 'Bencana', embung: 'Embung', pltm: 'PLTM', lainnya: 'Lainnya',
};

const locs = await db.collection('locations')
  .find({ division: 'DIVISI 2' })
  .project({ name: 1, category: 1, picSubs: 1, sectionUpdates: 1 })
  .toArray();
const idents = await db.collection('ssoidentities').find({}).project({ cognitoSub: 1, username: 1, name: 1 }).toArray();
const bySub = new Map(idents.map((i) => [i.cognitoSub, i]));

const toRow = (l) => {
  const subs = Array.isArray(l.picSubs) ? l.picSubs : [];
  const pics = subs.map((s) => {
    const i = bySub.get(s);
    if (i) return i.name || i.username || 'PIC';
    return s.startsWith('ldap_') ? s.replace('ldap_', '') : 'PIC (belum login)';
  });
  const su = l.sectionUpdates && typeof l.sectionUpdates === 'object' ? l.sectionUpdates : {};
  const keys = Object.keys(su);
  const last = keys.map((k) => su[k]?.at).filter(Boolean).sort().pop();
  return {
    name: l.name, category: l.category, categoryLabel: CAT_LABEL[l.category] ?? l.category,
    pics, hasPic: pics.length > 0, dims: keys.length, filled: keys.length > 0,
    last: last ? new Date(last).toISOString().slice(0, 10) : null,
  };
};
const all = locs.map(toRow);

const rank = (r) => (r.hasPic && r.filled ? 0 : r.hasPic ? 1 : r.filled ? 2 : 3);
const jiat = all.filter((r) => r.category === 'jiat').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
const reguler = all.filter((r) => r.category !== 'jiat' && r.category !== 'irigasi');
const regulerFilled = reguler.filter((r) => r.filled)
  .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || b.dims - a.dims || a.name.localeCompare(b.name));

const out = {
  generatedAt: new Date().toISOString(),
  tanggalLabel: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
  jamLabel: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }),
  jiat: {
    total: jiat.length,
    picCount: jiat.filter((r) => r.hasPic).length,
    filledCount: jiat.filter((r) => r.filled).length,
    lengkapCount: jiat.filter((r) => r.hasPic && r.filled).length,
    rows: jiat,
  },
  // Irigasi (DIR): ringkasan + daftar proyek (slide hanya menampilkan yang sudah mengisi).
  irigasi: (() => {
    const rs = all.filter((r) => r.category === 'irigasi')
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return {
      total: rs.length,
      picCount: rs.filter((r) => r.hasPic).length,
      filledCount: rs.filter((r) => r.filled).length,
      lengkapCount: rs.filter((r) => r.hasPic && r.filled).length,
      rows: rs,
    };
  })(),
  jiatDiKategoriLain: all.filter((r) => r.category !== 'jiat' && /^jiat\b/i.test(r.name))
    .map((r) => ({ name: r.name, categoryLabel: r.categoryLabel, hasPic: r.hasPic, filled: r.filled })),
  reguler: {
    totalProyek: reguler.length,
    picCount: reguler.filter((r) => r.hasPic).length,
    filledCount: regulerFilled.length,
    rows: regulerFilled,
  },
};

await mkdir('scripts/slides-data', { recursive: true });
await writeFile('scripts/slides-data/adopsi.json', JSON.stringify(out, null, 2));
console.log(`OK adopsi.json · JIAT ${out.jiat.total} (PIC ${out.jiat.picCount}, isi ${out.jiat.filledCount}, lengkap ${out.jiat.lengkapCount}) · reguler terisi ${out.reguler.filledCount}/${out.reguler.totalProyek}`);
await mongoose.disconnect();
