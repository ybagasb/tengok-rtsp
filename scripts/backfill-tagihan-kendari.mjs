/**
 * scripts/backfill-tagihan-kendari.mjs
 *
 * Skrip migrasi/backfill nilai tagihanBruto proyek Kendari ke database.
 * Menghubungkan ke MongoDB via process.env.MONGODB_URI menggunakan mongoose.
 *
 * Mode default: DRY-RUN (hanya membaca dan mencetak proyek dengan nama mengandung "kendari")
 * Mode eksekusi: tambahkan flag --apply --id=<ObjectId>
 *
 * Penggunaan:
 *   1. Dry-run (cek data):
 *      node scripts/backfill-tagihan-kendari.mjs
 *      atau
 *      MONGODB_URI="<connection-string>" node scripts/backfill-tagihan-kendari.mjs
 *
 *   2. Terapkan pembaruan:
 *      node scripts/backfill-tagihan-kendari.mjs --apply --id=67b...
 *      atau
 *      MONGODB_URI="<connection-string>" node scripts/backfill-tagihan-kendari.mjs --apply --id=67b...
 */

import mongoose from 'mongoose';

const TARGET_TAGIHAN_BRUTO = 49_000_000_000; // Rp 49 Miliar

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[Error] Variabel lingkungan MONGODB_URI belum disetel.');
    console.error('Jalankan dengan: MONGODB_URI="mongodb://..." node scripts/backfill-tagihan-kendari.mjs');
    process.exit(1);
  }

  // Parse argumen CLI
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const idArg = args.find((a) => a.startsWith('--id='));
  const targetId = idArg ? idArg.split('=')[1] : null;

  console.log('='.repeat(70));
  console.log('Skrip Backfill Tagihan Bruto Kendari');
  console.log(`Mode: ${isApply ? 'APPLY (Tulis ke database)' : 'DRY-RUN (Hanya baca)'}`);
  console.log('='.repeat(70));

  try {
    console.log('Menghubungkan ke MongoDB...');
    await mongoose.connect(uri);
    console.log('Terhubung ke database.');

    const LocationSchema = new mongoose.Schema(
      {
        name: String,
        tagihanBruto: Number,
      },
      { collection: 'locations', strict: false }
    );

    const Location = mongoose.models.Location || mongoose.model('Location', LocationSchema);

    // Cari semua proyek yang namanya mengandung "kendari" (case-insensitive)
    const kendariProjects = await Location.find({
      name: { $regex: /kendari/i },
    }).lean();

    console.log(`\nDitemukan ${kendariProjects.length} proyek mengandung nama "kendari":\n`);
    for (const p of kendariProjects) {
      console.log(`  - ID          : ${p._id}`);
      console.log(`    Nama        : ${p.name}`);
      console.log(`    TagihanBruto: ${p.tagihanBruto != null ? p.tagihanBruto.toLocaleString('id-ID') : '(kosong/null)'}`);
      console.log('');
    }

    if (!isApply) {
      console.log('-'.repeat(70));
      console.log('[DRY-RUN] Tidak ada perubahan yang disimpan ke database.');
      console.log('Untuk menerapkan nilai tagihanBruto (49.000.000.000) pada proyek tertentu:');
      console.log('  node scripts/backfill-tagihan-kendari.mjs --apply --id=<ObjectId>');
      console.log('-'.repeat(70));
      return;
    }

    // Validasi targetId untuk mode apply
    if (!targetId) {
      console.error('[Error] Mode --apply membutuhkan parameter --id=<ObjectId>.');
      console.error('Contoh: node scripts/backfill-tagihan-kendari.mjs --apply --id=67b...');
      process.exitCode = 1;
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      console.error(`[Error] ID "${targetId}" bukan ObjectId MongoDB yang valid.`);
      process.exitCode = 1;
      return;
    }

    const doc = await Location.findById(targetId);
    if (!doc) {
      console.error(`[Error] Dokumen proyek dengan _id ${targetId} tidak ditemukan.`);
      process.exitCode = 1;
      return;
    }

    // Pastikan hanya mengisi bila nilainya kosong/null
    if (doc.tagihanBruto != null) {
      console.warn(`[Peringatan] Proyek "${doc.name}" (${doc._id}) sudah memiliki tagihanBruto: ${doc.tagihanBruto}.`);
      console.warn('Operasi dibatalkan: skrip ini hanya mengisi jika nilai saat ini kosong.');
      return;
    }

    // Lakukan pembaruan
    doc.tagihanBruto = TARGET_TAGIHAN_BRUTO;
    await doc.save();

    console.log(`[SUKSES] Berhasil memperbarui tagihanBruto proyek "${doc.name}" (${doc._id}) menjadi ${TARGET_TAGIHAN_BRUTO.toLocaleString('id-ID')}.`);
  } catch (err) {
    console.error('[Error]', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Koneksi database ditutup.');
  }
}

main();
