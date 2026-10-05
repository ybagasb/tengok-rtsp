/**
 * seed_finansial_kendari.ts — SAMPLE: mengisi field finansial SR Kendari dari
 * laporan CASHFLOW AGT 2026 (baris "Sekolah Rakyat Provinsi Sultra") + progress
 * keuangan DIPA dari PPT SR Sultra.
 *
 * Nilai di workbook cashflow berbasis RIBU rupiah → dikalikan 1.000.000 di sini
 * agar tersimpan sebagai rupiah penuh.
 *
 * Cara pakai:
 *   npx tsx --env-file=.env.local scripts/seed_finansial_kendari.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_finansial_kendari.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';

// Dari CASHFLOW AGT 2026 — baris "Sekolah Rakyat Provinsi Sultra" (ribu Rp).
const RIBU = 1_000_000; // 1 unit workbook = Rp 1 juta (angka dalam ribuan rupiah x1000)
const cashIn = Math.round(400444.08 * RIBU);
const cashOut = Math.round(377572.28 * RIBU);
const saldoKas = cashIn - cashOut;                 // = Cash Balance (≈ Rp 22,87 M)
const saldoHutang = Math.round(97783.61 * RIBU);   // kolom 34 "HUTANG TOTAL"
const piutang = Math.round(21473.74 * RIBU);       // kolom 30 "PIUTANG TOTAL"
const bebanKonstruksi = Math.round(372556.10 * RIBU); // dummy — total operasional cashflow Agt 2026

// Hasil Usaha (Awal s.d Agustus 2026) — kolom 19-22, baris SR Sultra (ribu Rp).
const huPendapatan = Math.round(427696.41 * RIBU); // PU
const huBiaya = Math.round(411804.16 * RIBU);      // HPP
const hasilUsaha = { pendapatan: huPendapatan, biaya: huBiaya, laba: huPendapatan - huBiaya };

// Milestone dengan progress per-item (mockup, mengikuti lingkup pekerjaan SR Sultra).
const milestones = [
    { title: 'Pekerjaan Struktur',            done: true,  progress: 100, date: new Date('2026-04-30') },
    { title: 'Pekerjaan Arsitektur',          done: false, progress: 92,  date: new Date('2026-07-31') },
    { title: 'Pekerjaan MEP',                 done: false, progress: 88,  date: new Date('2026-07-31') },
    { title: 'Pekerjaan Landscape & Kawasan', done: false, progress: 75,  date: new Date('2026-08-15') },
    { title: 'Pekerjaan Lapangan',            done: false, progress: 60,  date: new Date('2026-08-20') },
    { title: 'Pekerjaan Furniture',           done: false, progress: 40,  date: new Date('2026-08-25') },
];

// Change Management (mockup).
const changeManagement = [
    {
        judul: 'Penambahan lingkup pekerjaan lapangan sepak bola',
        deskripsi: 'Penyesuaian spesifikasi rumput & sistem drainase lapangan sesuai permintaan pengguna jasa.',
        dampak: 'Menambah nilai kontrak dan memperpanjang pekerjaan lapangan ±2 minggu.',
        nilai: 2_500_000_000, tanggal: new Date('2026-06-10'),
        target: 'M3 Juli 2026', pic: 'PM, SOM', status: 'DISETUJUI', dariKendala: false,
    },
    {
        judul: 'Klaim eskalasi harga material',
        deskripsi: 'Penyebab: Kondisi ekonomi global menyebabkan perubahan harga signifikan.\nTindakan: Koordinasi dengan divisi & DLMK untuk perhitungan eskalasi.',
        dampak: 'Potensi penambahan biaya material; perlu persetujuan addendum.',
        nilai: 4_200_000_000, tanggal: new Date('2026-09-01'),
        target: 'M2 Okt 2026', pic: 'PM, SEM', status: 'USULAN', dariKendala: true,
    },
    {
        judul: 'Perubahan metode pengiriman material kepulauan',
        deskripsi: 'Penyewaan kapal untuk mempercepat pengiriman material ke lokasi kepulauan (Buton Tengah).',
        dampak: 'Menambah biaya logistik namun mempercepat penyelesaian ±1 minggu.',
        nilai: 1_100_000_000, tanggal: new Date('2026-09-15'),
        target: 'M1 Okt 2026', pic: 'PM, SEM', status: 'USULAN', dariKendala: true,
    },
];

// Progress keuangan DIPA (dari PPT SR Sultra) — rupiah penuh.
const progressKeuangan = [
    { tahun: 2025, rencana: 121_600_840_569, realisasi: 121_600_840_569 },
    { tahun: 2026, rencana: 373_247_877_631, realisasi: 249_535_698_101 },
];
const tagihanBelumDiproses = 45_147_392_541;

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seeding finansial SR Kendari${dryRun ? ' (DRY RUN)' : ''}...`);

    await dbConnect();

    const loc = await Location.findOne({ name: /kendari/i }).lean() as any;
    if (!loc) {
        console.error('SR Kendari tidak ditemukan di DB.');
        process.exit(1);
    }

    const set = { cashIn, cashOut, saldoKas, saldoHutang, piutang, bebanKonstruksi, hasilUsaha, milestones, changeManagement, progressKeuangan, tagihanBelumDiproses };

    console.log(`Target  : ${loc.name}`);
    console.log(`cashIn       : Rp ${cashIn.toLocaleString('id-ID')}`);
    console.log(`cashOut      : Rp ${cashOut.toLocaleString('id-ID')}`);
    console.log(`saldoKas     : Rp ${saldoKas.toLocaleString('id-ID')}`);
    console.log(`saldoHutang  : Rp ${saldoHutang.toLocaleString('id-ID')}`);
    console.log(`piutang      : Rp ${piutang.toLocaleString('id-ID')}`);
    console.log(`bebanKonstr  : Rp ${bebanKonstruksi.toLocaleString('id-ID')}`);
    console.log(`hasilUsaha   : PU ${huPendapatan.toLocaleString('id-ID')} | HPP ${huBiaya.toLocaleString('id-ID')} | Laba ${hasilUsaha.laba.toLocaleString('id-ID')}`);
    console.log(`milestones   : ${milestones.length} item (dengan progress)`);
    console.log(`changeMgmt   : ${changeManagement.length} item`);
    console.log(`DIPA         : ${JSON.stringify(progressKeuangan)}`);
    console.log(`tagihanBelum : Rp ${tagihanBelumDiproses.toLocaleString('id-ID')}`);

    if (!dryRun) {
        await Location.updateOne({ _id: loc._id }, { $set: set });
        console.log('\n✓ Tersimpan.');
    } else {
        console.log('\n(dry-run — tidak disimpan)');
    }

    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
