/**
 * seed_laporan_kendari.ts — DUMMY: mengisi dimensi data baru (laporan bulanan,
 * rencana tahunan, saldo awal kas) untuk proyek "SR Kendari".
 *
 * Angka akhir (Agustus 2026) sengaja diselaraskan dengan data SR Kendari yang
 * sudah ada (CASHFLOW AGT 2026: PU, HPP, cash in/out, tagihan bruto), sehingga
 * field lama yang disinkronkan otomatis nyaris tidak berubah. Angka bulan-bulan
 * sebelumnya, rencana, EVM, dan pengadaan adalah DUMMY.
 *
 * Aman diulang: menimpa seluruh laporanBulanan / rencanaKurvaS / saldo awal
 * proyek ini. Menolak jalan bila sudah ada laporan, kecuali --force.
 * Sebelum menulis, nilai lama dicadangkan ke .auth/kendari-laporan-backup.json
 * (folder ini di-gitignore) dan bisa dipulihkan dengan --undo.
 *
 * Cara pakai:
 *   npx tsx --env-file=.env.local scripts/seed_laporan_kendari.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_laporan_kendari.ts
 *   npx tsx --env-file=.env.local scripts/seed_laporan_kendari.ts --undo
 */
import fs from 'node:fs';
import path from 'node:path';
import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';
import { syncLegacy } from '../src/lib/projectSync';
import {
    sanitizeLaporan, sanitizeRencana, sanitizeSaldoAwal, computeEvm, derivedFromLaporan,
    type LaporanBulanan, type RencanaKurvaS,
} from '../src/lib/projectReport';

const DRY = process.argv.includes('--dry-run');
const UNDO = process.argv.includes('--undo');
const FORCE = process.argv.includes('--force');
const BACKUP = path.join(process.cwd(), '.auth', 'kendari-laporan-backup.json');

// Kolom field lama yang ikut berubah oleh sinkronisasi (dicadangkan).
const LEGACY_FIELDS = [
    'cpi', 'spi', 'tagihanBruto', 'hasilUsaha', 'pu', 'bk', 'lk', 'cashIn', 'cashOut', 'saldoKas',
    'progressPercent', 'progressRencana', 'progressDeviasi',
] as const;
const NEW_FIELDS = ['laporanBulanan', 'rencanaKurvaS', 'cashInAwal', 'cashOutAwal'] as const;

// ── Angka tetap dari data SR Kendari (Agustus 2026) ──────────────────────────
const PU_TOTAL = 427_696_410_000;        // Pendapatan s.d Agustus
const HPP_TOTAL = 411_804_160_000;       // HPP s.d Agustus
const CASH_IN_TOTAL = 400_444_080_000;   // total cash in (termasuk saldo awal)
const CASH_OUT_TOTAL = 377_572_280_000;
const CASH_IN_AWAL = 40_000_000_000;     // DUMMY: uang muka Des 2025 (sebelum laporan pertama)
const CASH_OUT_AWAL = 20_000_000_000;
const TAGIHAN_AGT = 49_000_000_000;
const BAC = 415_000_000_000;             // DUMMY: anggaran biaya
const PU_RKAP = 471_500_000_000;         // DUMMY: target PU RKAP 2026 (PU s.d Agt ≈ 90,7%)
const PAKET_TOTAL = 60;
const PAGU_TOTAL = 330_000_000_000;

// ── Bentuk kurva (persen kumulatif dari nilai kontrak), Jan..Des 2026 ─────────
const PLAN_RKAP_PCT = [14, 28, 44, 60, 74, 85, 94, 100, 100, 100, 100, 100];
const PLAN_EKS_PCT = [12, 25, 40, 55, 69, 81, 91, 98, 100, 100, 100, 100];
const RI_PCT = [12.8, 26.1, 41.5, 56.9, 71.2, 83.0, 92.4, 99.27];   // Jan..Agt
const N = RI_PCT.length;
const HPP_JITTER = [0.012, -0.006, 0.009, -0.004, 0.007, -0.003, 0.004, 0];
const TAGIHAN = [31, 28, 36, 40, 33, 42, 45, 49].map(v => v * 1e9);
const TARGET_TAGIHAN = [35, 30, 40, 45, 40, 45, 50, 55].map(v => v * 1e9);
const PAKET_REAL = [4, 10, 17, 26, 35, 44, 52, 57];
const PAGU_FRAC = [0.05, 0.14, 0.26, 0.41, 0.57, 0.72, 0.86, 0.95];
const CASH_IN_W = [0.09, 0.11, 0.13, 0.15, 0.14, 0.15, 0.12, 0.11];
const CASH_OUT_W = [0.10, 0.12, 0.14, 0.14, 0.14, 0.14, 0.12, 0.10];

const r0 = (n: number) => Math.round(n);
const periode = (i: number) => `2026-${String(i + 1).padStart(2, '0')}`;

/** Bagi total ke bulan sesuai bobot; bulan terakhir menyerap sisa agar jumlah tepat. */
function distribute(total: number, weights: number[]): number[] {
    const out = weights.slice(0, -1).map(w => r0(total * w));
    out.push(total - out.reduce((a, b) => a + b, 0));
    return out;
}
const cumulative = (arr: number[]) => arr.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
const diffs = (sd: number[]) => sd.map((v, i) => v - (sd[i - 1] ?? 0));

function build(contractValue: number) {
    const cv = contractValue;

    // Hasil usaha: s.d dibentuk dari bentuk kurva RI, bulan ini = selisih, s.d disusun ulang dari penjumlahan.
    const ratio = RI_PCT.map(p => p / RI_PCT[N - 1]);
    const puSd0 = ratio.map(r => r0(PU_TOTAL * r));
    const hppSd0 = ratio.map((r, i) => r0(HPP_TOTAL * r * (1 + HPP_JITTER[i])));
    const puM = diffs(puSd0);
    const hppM = diffs(hppSd0);
    const ebitdaM = puM.map((p, i) => r0(p - hppM[i] + 0.012 * p));
    const labaM = puM.map((p, i) => r0((p - hppM[i]) * 0.62));
    const puSd = cumulative(puM);
    const hppSd = cumulative(hppM);
    const ebitdaSd = cumulative(ebitdaM);
    const labaSd = cumulative(labaM);

    const cashIn = distribute(CASH_IN_TOTAL - CASH_IN_AWAL, CASH_IN_W);
    const cashOut = distribute(CASH_OUT_TOTAL - CASH_OUT_AWAL, CASH_OUT_W);

    const laporan: LaporanBulanan[] = [];
    for (let i = 0; i < N; i++) {
        const raw = {
            periode: periode(i),
            evm: {
                bac: BAC,
                bcws: r0(BAC * PLAN_RKAP_PCT[i] / 100),
                bcwp: r0(BAC * RI_PCT[i] / 100),
                acwp: hppSd[i],
            },
            ri: r0(cv * RI_PCT[i] / 100),
            huBulanIni: { pendapatan: puM[i], hpp: hppM[i], ebitda: ebitdaM[i], labaBersih: labaM[i] },
            huSdBulanIni: { pendapatan: puSd[i], hpp: hppSd[i], ebitda: ebitdaSd[i], labaBersih: labaSd[i] },
            cashIn: cashIn[i],
            cashOut: cashOut[i],
            tagihanBruto: i === N - 1 ? TAGIHAN_AGT : TAGIHAN[i],
            targetTagihan: TARGET_TAGIHAN[i],
            pengadaan: {
                paketTotal: PAKET_TOTAL,
                paketRealisasi: PAKET_REAL[i],
                paguTotal: PAGU_TOTAL,
                paguRealisasi: r0(PAGU_TOTAL * PAGU_FRAC[i]),
            },
        };
        const res = sanitizeLaporan(raw);
        if (!res.ok) throw new Error(`Laporan ${raw.periode} tidak valid: ${res.errors.join('; ')}`);
        laporan.push({ ...res.value, updatedAt: new Date().toISOString() });
    }

    // Rencana 2026: Kurva S (nilai kumulatif dari persen nilai kontrak) + rencana hasil usaha.
    const planPu = PLAN_RKAP_PCT.map(p => r0(PU_RKAP * p / 100));
    const planHpp = planPu.map(v => r0(v * 0.935));
    const rawRencana = {
        tahun: 2026,
        puRkap: PU_RKAP,
        raRkap: PLAN_RKAP_PCT.map(p => r0(cv * p / 100)),
        raEksternal: PLAN_EKS_PCT.map(p => r0(cv * p / 100)),
        huRencana: {
            pendapatan: planPu,
            hpp: planHpp,
            ebitda: planPu.map((v, i) => r0(v - planHpp[i] + 0.012 * v)),
            labaBersih: planPu.map((v, i) => r0((v - planHpp[i]) * 0.62)),
        },
    };
    const rres = sanitizeRencana(rawRencana);
    if (!rres.ok) throw new Error(`Rencana tidak valid: ${rres.errors.join('; ')}`);

    const sres = sanitizeSaldoAwal({ cashInAwal: CASH_IN_AWAL, cashOutAwal: CASH_OUT_AWAL });
    if (!sres.ok) throw new Error(`Saldo awal tidak valid: ${sres.errors.join('; ')}`);

    return { laporan, rencana: rres.value as RencanaKurvaS, saldoAwal: sres.value };
}

const fmtM = (v?: number) => (v == null ? '-' : `${(v / 1e9).toFixed(2)} M`);

async function main() {
    await dbConnect();
    const docs = await Location.find({ name: /^SR Kendari$/i }).select(`name contractValue ${LEGACY_FIELDS.join(' ')} ${NEW_FIELDS.join(' ')}`).lean<Record<string, unknown>[]>();
    if (docs.length !== 1) throw new Error(`Diharapkan tepat 1 proyek "SR Kendari", ditemukan ${docs.length}. Dibatalkan.`);
    const doc = docs[0];
    const id = String(doc._id);
    console.log(`Proyek: ${doc.name} (${id})`);

    // ── Undo ────────────────────────────────────────────────────────────────
    if (UNDO) {
        if (!fs.existsSync(BACKUP)) throw new Error(`Berkas cadangan tidak ada: ${BACKUP}`);
        const bak = JSON.parse(fs.readFileSync(BACKUP, 'utf-8')) as { id: string; legacy: Record<string, unknown>; fresh: Record<string, unknown> };
        if (bak.id !== id) throw new Error('Cadangan milik proyek lain. Dibatalkan.');
        const set: Record<string, unknown> = {};
        const unset: Record<string, ''> = {};
        for (const f of LEGACY_FIELDS) { if (bak.legacy[f] !== undefined) set[f] = bak.legacy[f]; else unset[f] = ''; }
        for (const f of NEW_FIELDS) { if (bak.fresh[f] !== undefined) set[f] = bak.fresh[f]; else unset[f] = ''; }
        if (DRY) { console.log('[dry-run] akan memulihkan:', { set: Object.keys(set), unset: Object.keys(unset) }); return; }
        await Location.collection.updateOne({ _id: doc._id as never }, {
            ...(Object.keys(set).length ? { $set: set } : {}),
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
        });
        console.log('✓ Dipulihkan dari cadangan.');
        return;
    }

    const cv = Number(doc.contractValue);
    if (!Number.isFinite(cv) || cv <= 0) throw new Error('Nilai kontrak SR Kendari belum terisi; progres fisik tidak bisa dihitung. Dibatalkan.');
    const existing = (doc.laporanBulanan as unknown[] | undefined)?.length ?? 0;
    if (existing > 0 && !FORCE) throw new Error(`Sudah ada ${existing} laporan bulanan. Jalankan dengan --force untuk menimpa.`);

    const { laporan, rencana, saldoAwal } = build(cv);

    // ── Ringkasan ───────────────────────────────────────────────────────────
    console.log('\nPeriode    CPI   SPI   RI%     PU s.d      HPP s.d     Cash In(bln)  Tagihan');
    for (const l of laporan) {
        const e = computeEvm(l.evm);
        console.log(
            `${l.periode}  ${e.cpi?.toFixed(2)}  ${e.spi?.toFixed(2)}  ${(((l.ri ?? 0) / cv) * 100).toFixed(2).padStart(6)}  ` +
            `${fmtM(l.huSdBulanIni?.pendapatan).padStart(10)}  ${fmtM(l.huSdBulanIni?.hpp).padStart(10)}  ${fmtM(l.cashIn).padStart(12)}  ${fmtM(l.tagihanBruto)}`,
        );
    }
    const derived = derivedFromLaporan({ laporanBulanan: laporan, rencanaKurvaS: [rencana], contractValue: cv, ...saldoAwal });
    console.log('\nField lama setelah sinkronisasi (sebelum → sesudah):');
    const show = (k: string, before: unknown, after: unknown) => console.log(`  ${k.padEnd(16)} ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    for (const k of Object.keys(derived) as (keyof typeof derived)[]) show(k, doc[k], derived[k]);

    if (DRY) { console.log('\n[dry-run] tidak ada yang ditulis.'); return; }

    // ── Cadangan lalu tulis ─────────────────────────────────────────────────
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    if (!fs.existsSync(BACKUP) || !FORCE) {
        const legacy: Record<string, unknown> = {};
        const fresh: Record<string, unknown> = {};
        for (const f of LEGACY_FIELDS) legacy[f] = doc[f];
        for (const f of NEW_FIELDS) fresh[f] = doc[f];
        fs.writeFileSync(BACKUP, JSON.stringify({ id, at: new Date().toISOString(), legacy, fresh }, null, 2));
        console.log(`\nCadangan nilai lama: ${BACKUP}`);
    } else {
        console.log(`\nCadangan awal dipertahankan (--force): ${BACKUP}`);
    }

    await Location.updateOne({ _id: id }, {
        $set: {
            laporanBulanan: laporan.map(l => ({ ...l, updatedAt: new Date(l.updatedAt as string) })),
            rencanaKurvaS: [rencana],
            ...saldoAwal,
        },
    });
    await syncLegacy(id);
    console.log('✓ Data dummy laporan SR Kendari tersimpan + field lama disinkronkan.');
}

main()
    .catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => process.exit());
