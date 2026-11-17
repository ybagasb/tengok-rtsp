// Snapshot READ-ONLY untuk slide rekap pengisian 3 divisi.
// Jalankan: node --env-file=.env.local scripts/rekap_pengisian_snapshot.mjs
// Output   : scripts/slides-data/rekap-pengisian.json (gitignored: berisi nama PIC)
// Penilaian 18 dimensi dilakukan di scripts/make_slide_rekap_pengisian.py.
import mongoose from 'mongoose';
import fs from 'node:fs';

const OUT = 'scripts/slides-data/rekap-pengisian.json';
const FIELDS = [
    'pmName', 'pmPhone', 'penggunaJasa', 'pengawas', 'penyediaJasa', 'contractor',
    'startDate', 'endDate', 'contractNumber', 'contractValue',
    'progressPercent', 'progressRencana',
    'tagihanBruto', 'cashIn', 'cashOut', 'saldoKas', 'saldoHutang', 'bad', 'piutang', 'ccc',
    'cpi', 'spi', 'pu', 'bk',
    'progressMinggu', 'progressKeuangan', 'milestones', 'sumberDaya', 'lingkupPekerjaan',
    'laporanBulanan', 'qhsse', 'gallery', 'documents',
];

// Ringkas nilai: array -> panjang, string -> panjang setelah trim, objek -> jumlah key, angka/tanggal apa adanya.
function brief(v) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string') return v.trim().length;
    if (typeof v === 'object') return Object.keys(v).length;
    return v;
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const db = mongoose.connection.db;
const locs = await db.collection('locations')
    .find({ division: { $in: ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'] } })
    .project(Object.fromEntries(['name', 'division', 'category', 'picSubs', ...FIELDS].map(k => [k, 1])))
    .toArray();

const subs = [...new Set(locs.flatMap(l => l.picSubs ?? []))];
const ids = await db.collection('ssoidentities')
    .find({ cognitoSub: { $in: subs } }).project({ cognitoSub: 1, name: 1, username: 1 }).toArray();
const nameOf = Object.fromEntries(ids.map(i => [i.cognitoSub, i.name || i.username]));

const rows = locs.map(l => {
    const o = {
        id: String(l._id), name: l.name, division: l.division, category: l.category ?? null,
        // PIC: nama dari ssoidentities; placeholder ldap_<username> dipakai bila belum login; null = sub tanpa nama.
        pics: (l.picSubs ?? []).map(s => nameOf[s] ?? (s.startsWith('ldap_') ? s.slice(5) : null)),
    };
    for (const f of FIELDS) o[f] = brief(l[f]);
    return o;
});

const now = new Date();
const fmt = (opts) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...opts }).format(now);
fs.mkdirSync('scripts/slides-data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
    at: now.toISOString(),
    tanggalLabel: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    jamLabel: fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.'),
    rows,
}, null, 1));
console.log(`Snapshot ${rows.length} proyek -> ${OUT}`);
await mongoose.disconnect();
