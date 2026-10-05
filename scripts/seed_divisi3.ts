/**
 * seed_divisi3.ts — Seed proyek DIVISI 3 (Jalan, Tol & Infrastruktur Transportasi).
 *
 * - Membuat kategori DIVISI 3 (Jalan Tol, Jembatan, BRT, Pipa Air, Pipa Gas,
 *   Sewerage, Bencana) bila belum ada.
 * - Menambah 15 proyek (2 SWA + 13 KSO) sebagai Location baru di DIVISI 3.
 * - projectType: SWA → NON_JO, KSO → JO.
 * - Koordinat = perkiraan titik kota/kabupaten dari lokasi pada nama proyek.
 * - Field detail lain dikosongkan (diisi admin).
 *
 * Pakai:
 *   npx tsx --env-file=.env.local scripts/seed_divisi3.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_divisi3.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';
import Category from '../src/models/Category';

// ── Kategori DIVISI 3 ────────────────────────────────────────────────────────
interface Cat { name: string; identifier: string; icon: string; color: string; }
const CATEGORIES: Cat[] = [
    { name: 'Jalan Tol', identifier: 'jalan-tol', icon: 'Milestone',   color: 'from-amber-500 to-orange-500' },
    { name: 'Jembatan',  identifier: 'jembatan',  icon: 'Construction', color: 'from-orange-500 to-red-500' },
    { name: 'BRT',       identifier: 'brt',       icon: 'BusFront',     color: 'from-lime-500 to-green-500' },
    { name: 'Pipa Air',  identifier: 'pipa-air',  icon: 'Droplets',     color: 'from-sky-500 to-cyan-400' },
    { name: 'Pipa Gas',  identifier: 'pipa-gas',  icon: 'Flame',        color: 'from-rose-500 to-amber-500' },
    { name: 'Sewerage',  identifier: 'sewerage',  icon: 'Waves',        color: 'from-teal-500 to-cyan-500' },
    { name: 'Bencana',   identifier: 'bencana',   icon: 'AlertTriangle', color: 'from-rose-500 to-orange-500' },
];

// ── Titik koordinat kota/kabupaten (perkiraan pusat) [lat, lng] ──────────────
const LOC: Record<string, [number, number]> = {
    'padang': [-0.9471, 100.4172],
    'cirebon': [-6.7320, 108.5523],
    'subang': [-6.5716, 107.7598],
    'ikn': [-0.9947, 116.7030],              // IKN Nusantara (perkiraan pusat KIPP)
    'balikpapan': [-1.2379, 116.8529],       // Karangjoang / KKT Kariangau
    'panimbang': [-6.4600, 105.8300],        // Serang–Panimbang (Pandeglang/Lebak)
    'tanjung-priok': [-6.1050, 106.8800],    // NPEA Tanjung Priok
    'dumai': [1.6667, 101.4500],             // Segmen Labuhan Batu–Duri
    'yogyakarta': [-7.5500, 110.3000],       // Tol Jogja–Bawen Seksi 2 (Magelang)
    'kotabaru': [-3.2400, 116.2500],         // Jembatan Pulau Laut, Kotabaru
    'mataram': [-8.5833, 116.1167],          // Sewerage Mataram
    'bandung': [-6.9147, 107.6098],          // BRT Bandung
    'semarang': [-6.9667, 110.4167],         // Sewerage Genuk A, Semarang
};

type PType = 'JO' | 'NON_JO';
interface Proj {
    name: string;
    kontrak: string;
    kategori: string;   // identifier kategori
    type: PType;        // JO (KSO) / NON_JO (SWA)
    loc: string;        // key LOC
}

// ── 15 proyek (2 SWA + 13 KSO) ───────────────────────────────────────────────
const PROJECTS: Proj[] = [
    // ===== SWAKELOLA (SWA → NON_JO) =====
    {
        name: 'Pasca Bencana Sumatera Barat 1',
        kontrak: 'Penanganan Keadaan Darurat Pasca Bencana Sumatera Barat 1',
        kategori: 'bencana', type: 'NON_JO', loc: 'padang',
    },
    {
        name: 'Pelebaran Mainroad Tol Palikanci Paket 2',
        kontrak: 'Jasa Konstruksi Pekerjaan Pelebaran Mainroad Jalur B Paket 2 (KM 195+400 - 204+800) pada Ruas Jalan Tol Palikanci Tahun 2026 (Cirebon)',
        kategori: 'jalan-tol', type: 'NON_JO', loc: 'cirebon',
    },

    // ===== KSO (JO) =====
    {
        name: 'Tol Patimban Access Paket 2',
        kontrak: 'Patimban Access Toll Road Construction Project Package 2 (Subang)',
        kategori: 'jalan-tol', type: 'JO', loc: 'subang',
    },
    {
        name: 'Tol IKN Seksi 3A-2',
        kontrak: 'Proyek Pembangunan Jalan Tol IKN Seksi 3A-2 : Segmen Karangjoang - KKT Kariangau',
        kategori: 'jalan-tol', type: 'JO', loc: 'balikpapan',
    },
    {
        name: 'Tol Serang-Panimbang Seksi III Fase 2 Paket 2',
        kontrak: 'Proyek Pembangunan Jalan Tol Serang - Panimbang Seksi III (Cileles - Panimbang) Fase 2 Paket 2 (Seksi 3 Cileles – Panimbang)',
        kategori: 'jalan-tol', type: 'JO', loc: 'panimbang',
    },
    {
        name: 'NPEA Tanjung Priok Seksi I',
        kontrak: 'Pekerjaan Rancang Bangun Pembangunan Akses Pelabuhan Tanjung Priok Timur Baru / New Priok Eastern Access (NPEA) Seksi I : STA.0+000 (P1) - STA.2+777 (P38) (Tanjung Priok)',
        kategori: 'jalan-tol', type: 'JO', loc: 'tanjung-priok',
    },
    {
        name: 'Jaringan Perpipaan Air Minum IKN',
        kontrak: 'Pembangunan Jaringan Perpipaan Air Minum (IKN)',
        kategori: 'pipa-air', type: 'JO', loc: 'ikn',
    },
    {
        name: 'Pipa Transmisi Gas Labuhan Batu-Duri',
        kontrak: 'Pembangunan Pipa Transmisi Gas Segmen Stasiun Labuhan Batu sampai dengan Fasilitas di Duri (Dumai–Sei Mangkei)',
        kategori: 'pipa-gas', type: 'JO', loc: 'dumai',
    },
    {
        name: 'Tol Yogyakarta-Bawen Seksi 2',
        kontrak: 'Jasa Konstruksi Pembangunan Jalan Tol Yogyakarta - Bawen Seksi 2 (Sta. 52+300 s.d. Sta. 67+500)',
        kategori: 'jalan-tol', type: 'JO', loc: 'yogyakarta',
    },
    {
        name: 'Jembatan Pulau Laut Kotabaru',
        kontrak: 'Pembangunan Jembatan Pulau Laut Kabupaten Kotabaru (Tahun Jamak) (Pulau Laut - Kotabaru)',
        kategori: 'jembatan', type: 'JO', loc: 'kotabaru',
    },
    {
        name: 'Sewerage Mataram B CWIM-03',
        kontrak: 'Sewerage Pipe Installation Mataram B - CWIM-03',
        kategori: 'sewerage', type: 'JO', loc: 'mataram',
    },
    {
        name: 'Jalan Bebas Hambatan IKN Seksi 6B & 6C-1',
        kontrak: 'Pembangunan Jalan Bebas Hambatan Seksi 6B: Rencana Outer Ring Road – Sp. 3 ITCI Tahap 2 dan Pembangunan Jalan Seksi 6C–1 (Fungsional) (IKN)',
        kategori: 'jalan-tol', type: 'JO', loc: 'ikn',
    },
    {
        name: 'BRT Bandung Lot 2 Halte On Corridor',
        kontrak: 'Pembangunan BRT Metropolitan Cekungan Bandung - Lot 2 - Paket Halte On Corridor (Bandung)',
        kategori: 'brt', type: 'JO', loc: 'bandung',
    },
    {
        name: 'BRT Bandung Lot 1 Jalur On Corridor',
        kontrak: 'Pembangunan BRT Metropolitan Cekungan Bandung - Lot 1 - Paket Jalur On Corridor (Bandung)',
        kategori: 'brt', type: 'JO', loc: 'bandung',
    },
    {
        name: 'Sewerage Genuk A CWIS-05',
        kontrak: 'Sewerage Pipe Installation, Genuk A - CWIS-05 (Rebidding) (Semarang)',
        kategori: 'sewerage', type: 'JO', loc: 'semarang',
    },
];

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seed DIVISI 3${dryRun ? ' (DRY RUN)' : ''} — ${PROJECTS.length} proyek, ${CATEGORIES.length} kategori\n`);

    await dbConnect();

    // 1) Upsert kategori
    for (const c of CATEGORIES) {
        const exists = await Category.findOne({ identifier: c.identifier }).lean();
        if (exists) {
            console.log(`  kategori "${c.identifier}" sudah ada — lewati`);
        } else {
            console.log(`  + kategori "${c.name}" (${c.identifier})`);
            if (!dryRun) {
                await Category.create({ ...c, description: `Proyek ${c.name} (DIVISI 3)` });
            }
        }
    }

    // 2) Insert proyek
    let created = 0, skipped = 0, missingLoc = 0;
    for (const p of PROJECTS) {
        const coord = LOC[p.loc];
        if (!coord) { missingLoc++; console.warn(`  !! koordinat "${p.loc}" tidak ada untuk ${p.name}`); continue; }
        const [lat, lng] = coord;
        const dup = await Location.findOne({ name: p.name, division: 'DIVISI 3' }).lean();
        if (dup) { skipped++; console.log(`  = sudah ada: ${p.name}`); continue; }
        console.log(`  + ${p.name}  [${p.kategori}/${p.type}]  ${lat},${lng}`);
        if (!dryRun) {
            await Location.create({
                name: p.name,
                category: p.kategori,
                division: 'DIVISI 3',
                projectType: p.type,
                lat, lng,
                contractNumber: '',
                description: p.kontrak,
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
