/**
 * seed_divisions.ts — mengisi field `division` & `projectType` pada dokumen Location
 * (proyek Sekolah Rakyat) berdasarkan pemetaan provinsi → divisi/tipe.
 *
 * Cara pakai:
 *   npx tsx scripts/seed_divisions.ts --dry-run   # lihat rencana tanpa menyimpan
 *   npx tsx scripts/seed_divisions.ts             # terapkan perubahan
 *
 * Semua Sekolah Rakyat berada di DIVISI 1. Hanya SR Jawa Timur 2 (Ngawi, Pacitan,
 * Madiun, Nganjuk) yang Non-JO; sisanya JO. Pencocokan memakai substring
 * (case-insensitive) terhadap nama Location.
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';
import type { Divisi, ProjectType } from '../src/models/Location';

interface Assignment {
    match: string;          // substring nama proyek (case-insensitive)
    division: Divisi;
    projectType: ProjectType;
    cpi?: number;           // Cost Performance Index (dari laporan EVA per provinsi)
    spi?: number;           // Schedule Performance Index
}

// CPI/SPI diambil dari laporan EVA per PROVINSI (satu nilai per provinsi), lalu
// diterapkan ke semua kota Sekolah Rakyat di provinsi tersebut.
const ASSIGNMENTS: Assignment[] = [
    // ── DIVISI 1 · Jawa Timur 2 · Non-JO · CPI 1.00 / SPI 0.99 ────────────────
    { match: 'Ngawi',        division: 'DIVISI 1', projectType: 'NON_JO', cpi: 1.00, spi: 0.99 },
    { match: 'Pacitan',      division: 'DIVISI 1', projectType: 'NON_JO', cpi: 1.00, spi: 0.99 },
    { match: 'Madiun',       division: 'DIVISI 1', projectType: 'NON_JO', cpi: 1.00, spi: 0.99 },
    { match: 'Nganjuk',      division: 'DIVISI 1', projectType: 'NON_JO', cpi: 1.00, spi: 0.99 },

    // ── DIVISI 1 · Jawa Barat 1 · JO · CPI 1.01 / SPI 0.93 ────────────────────
    { match: 'Indramayu',    division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 0.93 },
    { match: 'Cirebon',      division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 0.93 },
    { match: 'Sumedang',     division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 0.93 },

    // ── DIVISI 1 · Jawa Barat 2 · JO · CPI 1.01 / SPI 1.01 ────────────────────
    { match: 'Cikarang',     division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 1.01 },
    { match: 'Bekasi',       division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 1.01 },
    { match: 'Jasinga',      division: 'DIVISI 1', projectType: 'JO', cpi: 1.01, spi: 1.01 },

    // ── DIVISI 1 · Kalimantan Selatan · JO · CPI 1.00 / SPI 0.92 ──────────────
    { match: 'Barito Kuala', division: 'DIVISI 1', projectType: 'JO', cpi: 1.00, spi: 0.92 },
    { match: 'Kota Baru',    division: 'DIVISI 1', projectType: 'JO', cpi: 1.00, spi: 0.92 },
    { match: 'Tanah Bumbu',  division: 'DIVISI 1', projectType: 'JO', cpi: 1.00, spi: 0.92 },

    // ── DIVISI 1 · Sulawesi Utara · JO · CPI 0.99 / SPI 0.95 ──────────────────
    { match: 'Minahasa',     division: 'DIVISI 1', projectType: 'JO', cpi: 0.99, spi: 0.95 },

    // ── DIVISI 1 · Sulawesi Tenggara · JO · CPI 1.00 / SPI 0.93 ───────────────
    { match: 'Kendari',      division: 'DIVISI 1', projectType: 'JO', cpi: 1.00, spi: 0.93 },
    { match: 'Buton Tengah', division: 'DIVISI 1', projectType: 'JO', cpi: 1.00, spi: 0.93 },

    // ── DIVISI 1 · Lampung · JO · CPI 0.99 / SPI 0.97 ─────────────────────────
    { match: 'Sukadana',     division: 'DIVISI 1', projectType: 'JO', cpi: 0.99, spi: 0.97 },
];

function pickAssignment(name: string): Assignment | undefined {
    const n = name.toLowerCase();
    return ASSIGNMENTS.find(a => n.includes(a.match.toLowerCase()));
}

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seeding divisions${dryRun ? ' (DRY RUN)' : ''}...`);

    await dbConnect();

    const locations = await Location.find({}, { name: 1, division: 1, projectType: 1, cpi: 1, spi: 1 }).lean() as any[];
    console.log(`Found ${locations.length} locations.`);

    let matched = 0;
    let updated = 0;
    const unmatched: string[] = [];

    for (const loc of locations) {
        const a = pickAssignment(loc.name);
        if (!a) {
            unmatched.push(loc.name);
            continue;
        }
        matched++;
        const set: Record<string, any> = { division: a.division, projectType: a.projectType };
        if (a.cpi != null) set.cpi = a.cpi;
        if (a.spi != null) set.spi = a.spi;
        const needsUpdate =
            loc.division !== a.division ||
            loc.projectType !== a.projectType ||
            (a.cpi != null && loc.cpi !== a.cpi) ||
            (a.spi != null && loc.spi !== a.spi);
        console.log(
            `• ${loc.name}  →  ${a.division} / ${a.projectType}` +
            (a.cpi != null ? ` · CPI ${a.cpi} / SPI ${a.spi}` : '') +
            (needsUpdate ? '' : '  (sudah sesuai)')
        );
        if (needsUpdate && !dryRun) {
            await Location.updateOne({ _id: loc._id }, { $set: set });
            updated++;
        }
    }

    console.log('\n── Ringkasan ──');
    console.log(`Cocok dengan tabel : ${matched}`);
    console.log(`Diperbarui         : ${dryRun ? '(dry-run, 0)' : updated}`);
    if (unmatched.length) {
        console.log(`Belum dipetakan    : ${unmatched.length}`);
        unmatched.forEach(n => console.log(`   - ${n}`));
    }

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
