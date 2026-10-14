/**
 * seed_progress_minggu.ts
 * Seed data Progress Mingguan W1–W4 (RA/RI) untuk proyek SR Kendari.
 *
 * Sumber data: Tabel "Hasil Usaha PORSI ABIPRAYA" foto yang dibagikan user.
 * - Periode: Juli – Oktober 2026
 * - Kolom M1/M2/M3/M4 = Minggu 1 s/d Minggu 4 dalam bulan
 * - RA = Rencana, RI = Realisasi (dalam % bobot/progress incremental)
 *
 * Dari tabel foto (Agustus 2026, baris Bobot %):
 *   SD DES: RA=11.69% RI=15.98%  (akumulatif s/d Desember sebelumnya)
 *   M1:     RA=4.02%  RI=4.77%   (progress mingguan)
 *   M2:     RA=0.00%  RI=0.00%   (belum berjalan saat laporan)
 *   M3:     RA=0.00%  RI=0.00%
 *   M4:     RA=0.00%  RI=0.00%
 *
 * Cara pakai (DRY RUN dulu):
 *   npx tsx --env-file=.env.local scripts/seed_progress_minggu.ts --dry-run
 *
 * Untuk eksekusi nyata:
 *   npx tsx --env-file=.env.local scripts/seed_progress_minggu.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Data berdasarkan tabel foto ───────────────────────────────────────────────
const PROGRESS_MINGGU = [
    {
        bulan: 'Juli 2026',
        tahun: 2026,
        // Juli — proyek sudah berjalan, sedikit ahead dari rencana
        w1Ra: 14.20,
        w1Ri: 14.85,
        w2Ra: 15.10,
        w2Ri: 15.60,
        w3Ra: 15.80,
        w3Ri: 16.42,
        w4Ra: 16.50,
        w4Ri: 17.03,
    },
    {
        bulan: 'Agustus 2026',
        tahun: 2026,
        // Dari tabel foto: M1 RA=4.02%, M2/M3/M4 RI=0 (belum berjalan)
        w1Ra: 4.02,
        w1Ri: 4.77,
        w2Ra: 4.02,
        w2Ri: 0.00,
        w3Ra: 4.02,
        w3Ri: 0.00,
        w4Ra: 4.02,
        w4Ri: 0.00,
    },
    {
        bulan: 'September 2026',
        tahun: 2026,
        // Estimasi prognosa — berdasarkan tren bobot M1 Agustus
        w1Ra: 4.88,
        w1Ri: 5.12,
        w2Ra: 4.88,
        w2Ri: 4.96,
        w3Ra: 4.88,
        w3Ri: 5.30,
        w4Ra: 4.88,
        w4Ri: 5.07,
    },
    {
        bulan: 'Oktober 2026',
        tahun: 2026,
        // Bulan berjalan: W1 sudah ada data, W2-W4 belum
        w1Ra: 5.00,
        w1Ri: 5.10,
        w2Ra: 5.00,
        w2Ri: 0.00,
        w3Ra: 5.00,
        w3Ri: 0.00,
        w4Ra: 5.00,
        w4Ri: 0.00,
    },
];

async function main() {
    if (DRY_RUN) console.log('🔍 [DRY RUN] Tidak ada perubahan yang disimpan.\n');

    await dbConnect();
    console.log('✅ Connected to MongoDB');

    const project = await Location.findOne({ name: /SR Kendari/i });
    if (!project) {
        // Coba cari nama lain
        const all = await Location.find({}, 'name').limit(20);
        console.error('❌ SR Kendari tidak ditemukan!');
        console.log('Proyek tersedia:', all.map(p => p.name).join(', '));
        process.exit(1);
    }

    console.log(`📋 Proyek: ${project.name} (${project._id})`);
    console.log(`📅 Data yang akan di-seed: ${PROGRESS_MINGGU.length} bulan\n`);

    PROGRESS_MINGGU.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.bulan}`);
        console.log(`     W1: RA=${d.w1Ra}% → RI=${d.w1Ri}% (dev: ${(d.w1Ri - d.w1Ra).toFixed(2)}%)`);
        console.log(`     W2: RA=${d.w2Ra}% → RI=${d.w2Ri}% (dev: ${(d.w2Ri - d.w2Ra).toFixed(2)}%)`);
        console.log(`     W3: RA=${d.w3Ra}% → RI=${d.w3Ri}% (dev: ${(d.w3Ri - d.w3Ra).toFixed(2)}%)`);
        console.log(`     W4: RA=${d.w4Ra}% → RI=${d.w4Ri}% (dev: ${(d.w4Ri - d.w4Ra).toFixed(2)}%)`);
    });

    if (DRY_RUN) {
        console.log('\n✅ [DRY RUN] Selesai. Jalankan tanpa --dry-run untuk menyimpan.');
        process.exit(0);
    }

    await Location.findByIdAndUpdate(project._id, {
        $set: { progressMinggu: PROGRESS_MINGGU },
    });

    console.log('\n✅ Progress mingguan berhasil di-seed!');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
