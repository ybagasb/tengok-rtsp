/**
 * seed_div1_proyek.ts — Import proyek on-going DIVISI 1 dari
 * "proyek on going div 1.xlsx" (sheet "Detail Proyek - BEST").
 *
 * - Kategori dibuat dari kolom SEGMENTASI (perkantoran, rumah-sakit, sekolah,
 *   dsb) bila belum ada.
 * - Nilai kontrak di Excel dalam RIBU rupiah → x1.000.000 (rupiah penuh).
 * - Proyek Sekolah Rakyat (SR) DILEWATI karena sudah di-seed sebelumnya.
 * - Koordinat = perkiraan dari lokasi pada nama proyek.
 * - description = nama paket; owner disimpan ke penggunaJasa.
 *
 * Pakai:
 *   npx tsx --env-file=.env.local scripts/seed_div1_proyek.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_div1_proyek.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';
import Category from '../src/models/Category';

const JT = 1_000_000; // 1 unit workbook (ribu rupiah) = Rp 1 juta

// ── Kategori DIVISI 1 (dari SEGMENTASI) ──────────────────────────────────────
interface Cat { name: string; identifier: string; icon: string; color: string; }
const CATEGORIES: Cat[] = [
    { name: 'Perkantoran',      identifier: 'perkantoran',      icon: 'Building2',   color: 'from-indigo-500 to-blue-500' },
    { name: 'Rumah Sakit',      identifier: 'rumah-sakit',      icon: 'Cross',       color: 'from-rose-500 to-red-500' },
    { name: 'Sekolah',          identifier: 'sekolah',          icon: 'GraduationCap', color: 'from-sky-500 to-cyan-500' },
    { name: 'Rusun',            identifier: 'rusun',            icon: 'Building',    color: 'from-violet-500 to-purple-500' },
    { name: 'Perumahan',        identifier: 'perumahan',        icon: 'Home',        color: 'from-emerald-500 to-teal-500' },
    { name: 'Gedung Olahraga',  identifier: 'gor',              icon: 'Dumbbell',    color: 'from-amber-500 to-orange-500' },
    { name: 'Bandara',          identifier: 'bandara',          icon: 'Plane',       color: 'from-cyan-500 to-blue-500' },
    { name: 'Rumah Ibadah',     identifier: 'rumah-ibadah',     icon: 'Church',      color: 'from-yellow-500 to-amber-500' },
    { name: 'Gedung Kesehatan', identifier: 'gedung-kesehatan', icon: 'Stethoscope', color: 'from-pink-500 to-rose-500' },
];

// Peta SEGMENTASI (teks Excel) → identifier kategori.
const SEG_MAP: Record<string, string> = {
    'PERKANTORAN': 'perkantoran',
    'PERUMAHAN': 'perumahan',
    'RUMAH SAKIT': 'rumah-sakit',
    'SEKOLAH': 'sekolah',
    'GEDUNG OLAHRAGA': 'gor',
    'BANDARA': 'bandara',
    'RUSUN': 'rusun',
    'RUMAH IBADAH': 'rumah-ibadah',
    'GEDUNG KESEHATAN': 'gedung-kesehatan',
};

// ── Koordinat perkiraan [lat, lng] ───────────────────────────────────────────
const LOC: Record<string, [number, number]> = {
    'jakarta-barat': [-6.1680, 106.7580],
    'jakarta-pusat': [-6.1860, 106.8340],
    'jakarta-utara': [-6.1030, 106.9000],   // Marunda
    'jakarta': [-6.2000, 106.8166],
    'sitaro': [2.3000, 125.3700],           // Gunung Ruang, Sulut
    'sorong': [-0.8762, 131.2558],          // Papua Barat Daya
    'kuala-lumpur': [3.1390, 101.6869],
    'sumba-barat-daya': [-9.6500, 119.0000],
    'manggarai-timur': [-8.6300, 120.7200], // Borong
    'tanjung-enim': [-3.7700, 103.7700],    // Bukit Asam, Sumsel
    'bengkulu': [-3.8600, 102.3390],        // Bandara Fatmawati
    'ikn': [-0.9947, 116.7030],
    'malang': [-7.9666, 112.6326],          // Univ Brawijaya
    'bolmut': [0.8900, 123.1000],           // Bolaang Mongondow Utara
    'boltim': [0.7400, 124.4000],           // Bolaang Mongondow Timur
    'aceh': [5.5483, 95.3238],
    'padang': [-0.9471, 100.4172],          // Sumbar
};

interface Proj {
    name: string;
    owner: string;
    nilaiRibu: number;   // nilai di Excel (ribu rupiah)
    waktu?: string;
    kategori: string;    // identifier
    loc: string;         // key LOC
}

// 32 baris Excel, SR DILEWATI (tidak dimasukkan ke daftar ini).
const PROJECTS: Proj[] = [
    { name: 'BTN Kebon Jeruk', owner: 'BTN', nilaiRibu: 116401.94, kategori: 'perkantoran', loc: 'jakarta-barat' },
    { name: 'Tanggap Gunung Ruang', owner: 'KEMEN-PU', nilaiRibu: 114446.72, kategori: 'perumahan', loc: 'sitaro' },
    { name: 'RS Abdi Waluyo', owner: 'Abdi Waluyo', nilaiRibu: 141117.86, kategori: 'rumah-sakit', loc: 'jakarta-pusat' },
    { name: 'Kantor Gubernur Papua Barat Daya', owner: 'KEMEN-PU', nilaiRibu: 136746.52, waktu: '18 Des 2024 - Feb 2026', kategori: 'perkantoran', loc: 'sorong' },
    { name: 'RR Infrastruktur Diplomatik RI di Kuala Lumpur', owner: 'KEMEN-PU', nilaiRibu: 131814.87, waktu: '27 Des 2024 - 31 Mei 2026', kategori: 'sekolah', loc: 'kuala-lumpur' },
    { name: 'RSUD Reda Bolo Sumba Barat Daya', owner: 'KEMEN-KES', nilaiRibu: 108108.12, kategori: 'rumah-sakit', loc: 'sumba-barat-daya' },
    { name: 'RSUD Borong Manggarai Timur', owner: 'KEMEN-KES', nilaiRibu: 103788.18, kategori: 'rumah-sakit', loc: 'manggarai-timur' },
    { name: 'GOR Jakbar', owner: 'DKI', nilaiRibu: 81470.94, waktu: '3 Jun 2025 - 1 Jan 2026', kategori: 'gor', loc: 'jakarta-barat' },
    { name: 'Pembangunan Gedung Baru RS Bukit Asam Medika', owner: 'PT BA', nilaiRibu: 80459.61, waktu: '... - Mei 2026', kategori: 'rumah-sakit', loc: 'tanjung-enim' },
    { name: 'AP Bengkulu Bandara Fatmawati', owner: 'PT AP', nilaiRibu: 76877.75, waktu: '18 Sep 2025 - 9 Jul 2026', kategori: 'bandara', loc: 'bengkulu' },
    { name: 'Proyek KBRI Malaysia', owner: 'KEMEN-PU', nilaiRibu: 669724.52, waktu: 'Des 2025 - Des 2027', kategori: 'perkantoran', loc: 'kuala-lumpur' },
    // SR Jatim 2 — DILEWATI
    { name: 'Revitalisasi Rusun 7 Marunda Cluster C', owner: 'DKI', nilaiRibu: 330630.63, waktu: 'Jan 2026 - Feb 2027', kategori: 'rusun', loc: 'jakarta-utara' },
    { name: 'Gene Bank', owner: 'KEMEN-KES', nilaiRibu: 440781.98, waktu: "Jan 2026 - Des 2026", kategori: 'rumah-sakit', loc: 'jakarta' },
    { name: 'Hunian Vertikal TNI Lanjutan', owner: 'KEMEN-PKP', nilaiRibu: 331514.57, kategori: 'rusun', loc: 'jakarta' },
    { name: 'Pembangunan Sekolah, Puskesmas dan Pasar di Kawasan Hunian ASN IKN', owner: 'KEMEN-PU', nilaiRibu: 256539.37, kategori: 'sekolah', loc: 'ikn' },
    { name: 'Gereja Basilika IKN', owner: 'KEMEN-PU', nilaiRibu: 178206.39, waktu: '23 Des 2024 - 3 Jan 2026', kategori: 'rumah-ibadah', loc: 'ikn' },
    { name: 'Sekolah DKI Paket 4', owner: 'DKI', nilaiRibu: 163017.37, waktu: '... - 31 Des 2025', kategori: 'sekolah', loc: 'jakarta' },
    // SR Kalsel, SR Sultra, SR Jabar 2, SR Sulut, SR Lampung, SR Jabar 1 — DILEWATI
    { name: 'Gedung MPR IKN', owner: 'OIKN', nilaiRibu: 306646.49, waktu: 'Des 2025 - Des 2027', kategori: 'perkantoran', loc: 'ikn' },
    { name: 'Gedung DPR IKN', owner: 'OIKN', nilaiRibu: 630079.59, waktu: 'Des 2025 - Des 2027', kategori: 'perkantoran', loc: 'ikn' },
    { name: 'Gedung Avokasi Universitas Brawijaya', owner: 'UB', nilaiRibu: 100750, waktu: 'Jan 2026 - Jan 2027', kategori: 'sekolah', loc: 'malang' },
    { name: 'RSUD Kemenkes Bolmut', owner: 'KEMEN-KES', nilaiRibu: 115591.78, waktu: 'Sep 2026 - Mei 2027', kategori: 'rumah-sakit', loc: 'bolmut' },
    { name: 'RSUD Kemenkes Boltim', owner: 'KEMENKEU', nilaiRibu: 122037.31, waktu: 'Jun 2026 - Jan 2027', kategori: 'rumah-sakit', loc: 'boltim' },
    { name: 'Tanggap Madrasah di Aceh 3', owner: 'KEMEN-PU', nilaiRibu: 90358.82, kategori: 'sekolah', loc: 'aceh' },
    { name: 'Tanggap Bencana Sumbar 2', owner: 'KEMEN-PU', nilaiRibu: 52690.77, kategori: 'gedung-kesehatan', loc: 'padang' },
    { name: 'Tanggap Pondok Pesantren di Aceh 1', owner: 'KEMEN-PU', nilaiRibu: 59689.11, kategori: 'sekolah', loc: 'aceh' },
];

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seed proyek DIVISI 1${dryRun ? ' (DRY RUN)' : ''} — ${PROJECTS.length} proyek (SR dilewati)\n`);

    await dbConnect();

    // 1) Upsert kategori
    for (const c of CATEGORIES) {
        const exists = await Category.findOne({ identifier: c.identifier }).lean();
        if (exists) {
            console.log(`  kategori "${c.identifier}" sudah ada — lewati`);
        } else {
            console.log(`  + kategori "${c.name}" (${c.identifier})`);
            if (!dryRun) await Category.create({ ...c, description: `Proyek ${c.name} (DIVISI 1)` });
        }
    }

    // 2) Insert proyek
    let created = 0, skipped = 0, missingLoc = 0;
    for (const p of PROJECTS) {
        const coord = LOC[p.loc];
        if (!coord) { missingLoc++; console.warn(`  !! koordinat "${p.loc}" tak ada untuk ${p.name}`); continue; }
        const [lat, lng] = coord;
        const dup = await Location.findOne({ name: p.name, division: 'DIVISI 1' }).lean();
        if (dup) { skipped++; console.log(`  = sudah ada: ${p.name}`); continue; }
        const nilai = Math.round(p.nilaiRibu * JT);
        console.log(`  + ${p.name}  [${p.kategori}]  ${lat},${lng}  Rp ${nilai.toLocaleString('id-ID')}`);
        if (!dryRun) {
            await Location.create({
                name: p.name,
                category: p.kategori,
                division: 'DIVISI 1',
                lat, lng,
                description: p.name,
                penggunaJasa: p.owner,
                contractValue: nilai,
                cameras: [],
                status: 'ongoing',
            });
            created++;
        }
    }

    console.log('\n── Ringkasan ──');
    console.log(`Proyek dibuat   : ${dryRun ? '(dry-run)' : created}`);
    console.log(`Sudah ada       : ${skipped}`);
    console.log(`Koordinat hilang: ${missingLoc}`);
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
