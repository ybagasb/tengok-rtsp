/**
 * seed_kendari_extra.ts — mengisi field BARU SR Kendari (SR Provinsi Sultra):
 *   - Finansial: ccc (Cash Conversion Cycle, hari) + bad (komponen hutang, IDR)
 *   - Operasi: pu / bk / lk (Pendapatan Usaha / Beban Konstruksi / Laba Kotor)
 *   - Operasi: monitoringPengadaan[] (major item + persentase) — dummy
 *   - Legal & Change Management: tambah `jenis` + `mitigasi` (dummy)
 *
 * Nilai IDR dari CASHFLOW AGT 2026 (baris "Sekolah Rakyat Provinsi Sultra",
 * angka workbook dalam RIBU rupiah → x1.000.000 = rupiah penuh).
 *
 * Cara pakai:
 *   npx tsx --env-file=.env.local scripts/seed_kendari_extra.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_kendari_extra.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';

const RIBU = 1_000_000; // 1 unit workbook = Rp 1 juta

// ── Finansial baru ───────────────────────────────────────────────────────────
const ccc = 120;                              // DUMMY — Cash Conversion Cycle (hari), >90 = merah
const bad = Math.round(42993.24 * RIBU);      // CASHFLOW AGT 2026, kolom BAD (komponen hutang)

// ── Operasi: PU / BK / LK ────────────────────────────────────────────────────
// PU = Pendapatan Usaha (Hasil Usaha PU), BK = Beban Konstruksi, LK = PU - BK.
const pu = Math.round(427696.41 * RIBU);      // Pendapatan Usaha (kolom PU hasil usaha)
const bk = Math.round(372556.10 * RIBU);      // Beban Konstruksi (operasional cashflow Agt 2026)
const lk = pu - bk;                           // Laba Kotor (dihitung)

// ── Monitoring Pengadaan (major item) — DUMMY ────────────────────────────────
const monitoringPengadaan = [
    { nama: 'Pengadaan Besi Beton & Baja Tulangan', persentase: 100 },
    { nama: 'Pengadaan Beton Readymix',             persentase: 95 },
    { nama: 'Pengadaan Material Arsitektur',        persentase: 82 },
    { nama: 'Pengadaan Peralatan MEP',              persentase: 68 },
    { nama: 'Pengadaan Furniture & Interior',       persentase: 40 },
];

// ── Legal & Change Management (dengan jenis + mitigasi) — DUMMY ───────────────
// Tepat 5 entri: satu untuk tiap jenis template.
const changeManagement = [
    {
        judul: 'Perubahan harga satuan pekerjaan tanah',
        jenis: 'PERUBAHAN_HARGA',
        deskripsi: 'Revisi harga satuan galian/timbunan akibat kondisi tanah aktual berbeda dari desain.',
        dampak: 'Penyesuaian nilai kontrak pada item pekerjaan tanah.',
        mitigasi: 'Verifikasi volume aktual bersama konsultan pengawas sebelum pengajuan review harga satuan.',
        nilai: 900_000_000, tanggal: new Date('2026-09-20'),
        target: 'M4 Okt 2026', pic: 'PM, QS', status: 'USULAN', dariKendala: false,
    },
    {
        judul: 'Penambahan lingkup pekerjaan lapangan sepak bola',
        jenis: 'PERUBAHAN_LINGKUP',
        deskripsi: 'Penyesuaian spesifikasi rumput & sistem drainase lapangan sesuai permintaan pengguna jasa.',
        dampak: 'Menambah nilai kontrak dan memperpanjang pekerjaan lapangan ±2 minggu.',
        mitigasi: 'Negosiasi addendum nilai kontrak & percepatan dengan penambahan shift kerja pada pekerjaan lapangan.',
        nilai: 2_500_000_000, tanggal: new Date('2026-06-10'),
        target: 'M3 Juli 2026', pic: 'PM, SOM', status: 'DISETUJUI', dariKendala: false,
    },
    {
        judul: 'Klaim eskalasi harga material',
        jenis: 'KLAIM',
        deskripsi: 'Kondisi ekonomi global menyebabkan perubahan harga material signifikan.',
        dampak: 'Potensi penambahan biaya material; perlu persetujuan addendum.',
        mitigasi: 'Pengajuan klaim eskalasi berbasis indeks harga + penguncian harga vendor via kontrak jangka panjang.',
        nilai: 4_200_000_000, tanggal: new Date('2026-09-01'),
        target: 'M2 Okt 2026', pic: 'PM, SEM', status: 'USULAN', dariKendala: true,
    },
    {
        judul: 'Tinjauan legal addendum masa pelaksanaan',
        jenis: 'LEGAL_ISSUE',
        deskripsi: 'Perpanjangan masa pelaksanaan membutuhkan review legal atas addendum kontrak & jaminan pelaksanaan.',
        dampak: 'Potensi keterlambatan administrasi bila addendum belum tuntas.',
        mitigasi: 'Koordinasi dini dengan Divisi Hukum & PPK untuk penyiapan draft addendum dan perpanjangan jaminan.',
        nilai: 0, tanggal: new Date('2026-09-25'),
        target: 'M1 Nov 2026', pic: 'PM, Legal', status: 'USULAN', dariKendala: false,
    },
    {
        judul: 'Penyesuaian jadwal pengiriman material ke kepulauan',
        jenis: 'LAINNYA',
        deskripsi: 'Penyewaan kapal tambahan untuk mempercepat pengiriman material ke lokasi kepulauan (Buton Tengah).',
        dampak: 'Menambah biaya logistik namun mempercepat penyelesaian ±1 minggu.',
        mitigasi: 'Konsolidasi muatan antar-paket & penjadwalan pelayaran mengikuti kondisi cuaca untuk menekan biaya sewa.',
        nilai: 1_100_000_000, tanggal: new Date('2026-09-15'),
        target: 'M1 Okt 2026', pic: 'PM, SEM', status: 'USULAN', dariKendala: true,
    },
];

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seeding field tambahan SR Kendari${dryRun ? ' (DRY RUN)' : ''}...`);

    await dbConnect();

    const loc = await Location.findOne({ name: /kendari/i }).lean() as any;
    if (!loc) {
        console.error('SR Kendari tidak ditemukan di DB.');
        process.exit(1);
    }

    const set = { ccc, bad, pu, bk, lk, monitoringPengadaan, changeManagement };

    console.log(`Target        : ${loc.name}`);
    console.log(`ccc           : ${ccc} hari (>90 = merah)`);
    console.log(`bad           : Rp ${bad.toLocaleString('id-ID')}`);
    console.log(`pu            : Rp ${pu.toLocaleString('id-ID')}`);
    console.log(`bk            : Rp ${bk.toLocaleString('id-ID')}`);
    console.log(`lk            : Rp ${lk.toLocaleString('id-ID')}`);
    console.log(`monitoring    : ${monitoringPengadaan.length} major item`);
    console.log(`changeMgmt    : ${changeManagement.length} item (jenis + mitigasi)`);

    if (!dryRun) {
        await Location.updateOne({ _id: loc._id }, { $set: set });
        console.log('\n✓ Tersimpan.');
    } else {
        console.log('\n(dry-run — tidak disimpan)');
    }

    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
