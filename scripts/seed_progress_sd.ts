/**
 * seed_progress_sd.ts
 * Isi Progress Mingguan proyek SR Kendari dengan SATU posisi "sampai dengan" (data dummy),
 * sesuai model baru: PIC cukup mengisi posisi terakhir, bukan tiap bulan.
 *
 * Data per-bulan lama digantikan. Nilai sebelumnya dicadangkan dulu ke
 * .auth/kendari-progress-minggu-backup.json (folder .auth di-ignore git).
 *
 * Cara pakai:
 *   npx tsx --env-file=.env.local scripts/seed_progress_sd.ts --dry-run   # lihat saja
 *   npx tsx --env-file=.env.local scripts/seed_progress_sd.ts             # terapkan
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_NAME = 'SR Kendari';
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

async function main() {
    await dbConnect();
    const now = new Date();
    const minggu = Math.min(4, Math.floor((now.getDate() - 1) / 7) + 1);   // 1..4, tanggal 29-31 dihitung W4
    // Dummy: rencana mingguan naik tipis, realisasi sedikit di atas rencana.
    const ra = 5.12;
    const ri = 5.25;
    const row: Record<string, number | string> = {
        bulan: BULAN[now.getMonth()],
        tahun: now.getFullYear(),
        w1Ra: 0, w1Ri: 0, w2Ra: 0, w2Ri: 0, w3Ra: 0, w3Ri: 0, w4Ra: 0, w4Ri: 0,
    };
    row[`w${minggu}Ra`] = ra;
    row[`w${minggu}Ri`] = ri;

    const doc = await Location.findOne({ name: PROJECT_NAME }).select('_id name progressMinggu').lean<{ _id: unknown; progressMinggu?: unknown[] }>();
    if (!doc) throw new Error(`Proyek "${PROJECT_NAME}" tidak ditemukan.`);
    console.log(`Proyek: ${PROJECT_NAME} (${String(doc._id)})`);
    console.log(`Sebelum: ${(doc.progressMinggu ?? []).length} baris`);
    console.log('Sesudah (1 baris):', JSON.stringify(row));
    console.log(`Posisi: s.d. W${minggu} ${row.bulan} ${row.tahun}  RA ${ra}  RI ${ri}`);
    if (DRY_RUN) { console.log('DRY RUN: tidak ada yang diubah.'); return; }

    const dir = path.resolve(process.cwd(), '.auth');
    await mkdir(dir, { recursive: true });
    const backup = path.join(dir, 'kendari-progress-minggu-backup.json');
    await writeFile(backup, JSON.stringify(doc.progressMinggu ?? [], null, 2));
    console.log(`Cadangan data lama: ${backup}`);

    const res = await Location.updateOne({ _id: doc._id }, { $set: { progressMinggu: [row] } });
    console.log(`Diubah: ${res.modifiedCount} dokumen.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e).split('\n')[0]); process.exit(1); });
