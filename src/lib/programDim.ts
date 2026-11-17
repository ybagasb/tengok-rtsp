/**
 * Turunan dimensi "model RRB" dari data proyek (Location) yang SUDAH ADA.
 * MURNI (tanpa mongoose/React) agar aman dipakai klien & server.
 *
 * Progress fisik  : progressRencana / progressPercent (%) × contractValue (Rp).
 * Progress keuangan: DIPA tersedia = Σ progressKeuangan[].rencana (data existing
 *                    di tab Finansial); MC cair(+label) dari Location.program
 *                    (diisi di tab Finansial); tagihan bruto dari data existing.
 * Progress internal: RBP = Rencana Internal (Rencana Tahunan, kumulatif s.d. bulan laporan terbaru),
 *                    RI = pendapatan s.d. bulan itu (Hasil Usaha laporan bulanan), Deviasi = RI − RBP.
 *                    Persen terhadap nilai kontrak (basis yang sama dengan Kurva S).
 * Profitabilitas  : BL (Beban Langsung), BAU, L/R (laba bersih) — masing-masing
 *                    rencana & realisasi dalam PERSEN terhadap pendapatan,
 *                    diambil dari Rencana Tahunan (rencana) & laporan bulanan
 *                    terbaru (realisasi, huSdBulanIni).
 */

import {
    latestLaporan, huRencanaPeriode,
    type LaporanBulanan, type RencanaKurvaS, type HasilUsahaPeriode,
} from '@/lib/projectReport';

export interface ProgramFisikRow { percent?: number; rupiah?: number }
export interface ProgramProfitRow { rencana?: number; realisasi?: number }

/** Dimensi dashboard model-RRB untuk satu proyek. */
export interface ProgramView {
    name: string;
    targetDate?: string;        // dari endDate
    sisaHari?: number;          // hari dari hari ini sampai endDate (negatif = sudah lewat)
    cutOffLabel?: string;       // dari program.cutOffLabel
    fisikRencana: ProgramFisikRow;
    fisikRealisasi: ProgramFisikRow;
    fisikDeviasi: ProgramFisikRow;
    internalRencana: ProgramFisikRow;   // RBP
    internalRealisasi: ProgramFisikRow; // RI
    internalDeviasi: ProgramFisikRow;   // RI − RBP
    dipaTersedia?: number;
    mcCair?: number;
    mcCairLabel?: string;
    tagihanBruto?: number;
    bl: ProgramProfitRow;       // Beban Langsung (% pendapatan)
    bau: ProgramProfitRow;      // Beban Administrasi & Umum (% pendapatan)
    labaRugi: ProgramProfitRow; // Laba bersih (% pendapatan)
}

/** Bagian Location yang dibutuhkan untuk menurunkan ProgramView. */
export interface ProgramSource {
    name: string;
    endDate?: string | Date;
    contractValue?: number;
    progressRencana?: number;    // persen 0..100
    progressPercent?: number;    // persen 0..100 (realisasi)
    tagihanBruto?: number;       // boleh sudah terisi (derived laporan)
    progressKeuangan?: { tahun: number; rencana: number; realisasi: number }[]; // DIPA
    laporanBulanan?: LaporanBulanan[];
    rencanaKurvaS?: RencanaKurvaS[];
    program?: {
        mcCair?: number;
        mcCairLabel?: string;
        cutOffLabel?: string;
    };
}

const pctOf = (part?: number, whole?: number): number | undefined =>
    typeof part === 'number' && typeof whole === 'number' && whole > 0 ? (part / whole) * 100 : undefined;

const rpOf = (percent?: number, basis?: number): number | undefined =>
    typeof percent === 'number' && typeof basis === 'number' ? (percent / 100) * basis : undefined;

function tanggalIso(v?: string | Date): string | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Selisih hari kalender dari hari ini sampai tanggal; undefined bila tanggal tak valid. */
function sisaHariDari(v?: string | Date, now: Date = new Date()): number | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return undefined;
    const day = 86_400_000;
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / day);
}

export function toProgramView(src: ProgramSource): ProgramView {
    const basis = typeof src.contractValue === 'number' && src.contractValue > 0 ? src.contractValue : undefined;

    const frPct = typeof src.progressRencana === 'number' ? src.progressRencana : undefined;
    const riPct = typeof src.progressPercent === 'number' ? src.progressPercent : undefined;
    const frRp = rpOf(frPct, basis);
    const riRp = rpOf(riPct, basis);
    const devPct = (typeof frPct === 'number' && typeof riPct === 'number') ? Math.round((riPct - frPct) * 100) / 100 : undefined;
    const devRp = (typeof frRp === 'number' && typeof riRp === 'number') ? riRp - frRp : undefined;

    // Realisasi hasil usaha s.d periode terbaru; rencana dari Rencana Tahunan periode yang sama.
    const latest = latestLaporan(src.laporanBulanan);
    const real: HasilUsahaPeriode | undefined = latest?.huSdBulanIni;
    const renc: HasilUsahaPeriode | undefined = latest ? huRencanaPeriode(src.rencanaKurvaS, latest.periode) : undefined;

    // Progress internal: RBP = Rencana Internal s.d. periode, RI = pendapatan s.d. periode (satu sumber dengan Kurva S).
    const rbpRp = renc?.pendapatan;
    const riInternalRp = real?.pendapatan;
    const rbpPct = pctOf(rbpRp, basis);
    const riInternalPct = pctOf(riInternalRp, basis);
    const devInternalRp = (typeof rbpRp === 'number' && typeof riInternalRp === 'number') ? riInternalRp - rbpRp : undefined;
    const devInternalPct = (typeof rbpPct === 'number' && typeof riInternalPct === 'number') ? Math.round((riInternalPct - rbpPct) * 100) / 100 : undefined;

    const profit = (pickReal?: number, pickRenc?: number, pendReal?: number, pendRenc?: number): ProgramProfitRow => ({
        rencana: pctOf(pickRenc, pendRenc),
        realisasi: pctOf(pickReal, pendReal),
    });

    // Tagihan: pakai field (sudah bisa derived dari laporan) atau tagihanBruto laporan terbaru.
    const tagihan = typeof src.tagihanBruto === 'number' ? src.tagihanBruto
        : (typeof latest?.tagihanBruto === 'number' ? latest.tagihanBruto : undefined);

    // DIPA tersedia = total pagu/rencana semua tahun DIPA (data existing tab Finansial).
    const dipaRows = src.progressKeuangan ?? [];
    const dipaTersedia = dipaRows.length
        ? dipaRows.reduce((a, r) => a + (typeof r.rencana === 'number' ? r.rencana : 0), 0)
        : undefined;

    return {
        name: src.name,
        targetDate: tanggalIso(src.endDate),
        sisaHari: sisaHariDari(src.endDate),
        cutOffLabel: src.program?.cutOffLabel,
        fisikRencana: { percent: frPct, rupiah: frRp },
        fisikRealisasi: { percent: riPct, rupiah: riRp },
        fisikDeviasi: { percent: devPct, rupiah: devRp },
        internalRencana: { percent: rbpPct, rupiah: rbpRp },
        internalRealisasi: { percent: riInternalPct, rupiah: riInternalRp },
        internalDeviasi: { percent: devInternalPct, rupiah: devInternalRp },
        dipaTersedia,
        mcCair: src.program?.mcCair,
        mcCairLabel: src.program?.mcCairLabel,
        tagihanBruto: tagihan,
        bl: profit(real?.bl, renc?.bl, real?.pendapatan, renc?.pendapatan),
        bau: profit(real?.bau, renc?.bau, real?.pendapatan, renc?.pendapatan),
        labaRugi: profit(real?.labaBersih, renc?.labaBersih, real?.pendapatan, renc?.pendapatan),
    };
}
