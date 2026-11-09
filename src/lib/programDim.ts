/**
 * Turunan dimensi "model RRB" dari data proyek (Location) yang SUDAH ADA.
 * MURNI (tanpa mongoose/React) agar aman dipakai klien & server.
 *
 * Progress fisik  : progressRencana / progressPercent (%) × contractValue (Rp).
 * Progress keuangan: DIPA tersedia = Σ progressKeuangan[].rencana (data existing
 *                    di tab Finansial); MC cair(+label) dari Location.program
 *                    (diisi di tab Finansial); tagihan bruto dari data existing.
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
    cutOffLabel?: string;       // dari program.cutOffLabel
    fisikRencana: ProgramFisikRow;
    fisikRealisasi: ProgramFisikRow;
    fisikDeviasi: ProgramFisikRow;
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
        cutOffLabel: src.program?.cutOffLabel,
        fisikRencana: { percent: frPct, rupiah: frRp },
        fisikRealisasi: { percent: riPct, rupiah: riRp },
        fisikDeviasi: { percent: devPct, rupiah: devRp },
        dipaTersedia,
        mcCair: src.program?.mcCair,
        mcCairLabel: src.program?.mcCairLabel,
        tagihanBruto: tagihan,
        bl: profit(real?.bl, renc?.bl, real?.pendapatan, renc?.pendapatan),
        bau: profit(real?.bau, renc?.bau, real?.pendapatan, renc?.pendapatan),
        labaRugi: profit(real?.labaBersih, renc?.labaBersih, real?.pendapatan, renc?.pendapatan),
    };
}
