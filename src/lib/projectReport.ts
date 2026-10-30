/**
 * Laporan bulanan proyek (dasar dashboard "Project Control").
 *
 * File ini MURNI (tanpa mongoose / server-only import) supaya aman dipakai
 * bersama oleh model, API route (validasi), dan komponen klien.
 *
 * Konvensi satuan: semua nilai uang disimpan dalam IDR penuh. Nilai EVM,
 * RI dan hasil usaha "s.d" bersifat KUMULATIF s.d periode laporan; cashIn /
 * cashOut / hasil usaha "bulan ini" adalah nilai bulan tersebut saja.
 */

export interface EvmData {
    bac?: number;    // Budget At Completion (total anggaran biaya)
    bcws?: number;   // Planned Value s.d periode
    bcwp?: number;   // Earned Value s.d periode
    acwp?: number;   // Actual Cost s.d periode
}

export interface HasilUsahaPeriode {
    pendapatan?: number;
    hpp?: number;
    ebitda?: number;       // boleh negatif
    labaBersih?: number;   // boleh negatif
}

export interface PengadaanData {
    paketTotal?: number;
    paketRealisasi?: number;
    paguTotal?: number;
    paguRealisasi?: number;
}

/** Posisi keuangan akhir periode (saldo/stok, bukan arus). */
export interface PosisiKeuangan {
    saldoHutang?: number;
    bad?: number;
    piutang?: number;
    ccc?: number;                    // hari
}

export interface LaporanBulanan {
    periode: string;                 // 'YYYY-MM'
    posisi?: PosisiKeuangan;
    evm?: EvmData;
    huBulanIni?: HasilUsahaPeriode;
    huSdBulanIni?: HasilUsahaPeriode;
    cashIn?: number;                 // Arus kas masuk bulan ini
    cashOut?: number;                // Arus kas keluar bulan ini
    tagihanBruto?: number;
    targetTagihan?: number;
    pengadaan?: PengadaanData;
    updatedAt?: string;
}

/**
 * Rencana hasil usaha kumulatif Jan..Des (12 nilai per seri, atau [] bila belum diisi).
 * Rencana PENDAPATAN tidak disimpan di sini: sama dengan Rencana Internal / raRkap (Kurva S berbasis PU).
 */
export interface HuRencanaSeries {
    hpp: number[];
    ebitda: number[];
    labaBersih: number[];
}

export interface RencanaKurvaS {
    tahun: number;
    puRkap?: number;          // Target PU RKAP setahun (IDR)
    raRkap: number[];         // 12 nilai kumulatif Jan..Des (= rencana pendapatan/PU), atau [] bila belum diisi
    raEksternal: number[];    // idem
    huRencana?: HuRencanaSeries;   // Rencana hasil usaha s.d tiap bulan
}

export const MAX_LAPORAN = 120;   // 10 tahun
export const MAX_RENCANA = 15;

export const BULAN_NAMA = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const PERIODE_RE = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const MAX_VALUE = 1e15;

export function isValidPeriode(p: unknown): p is string {
    return typeof p === 'string' && PERIODE_RE.test(p);
}

/** '2026-09' → 'September 2026' */
export function periodeLabel(p: string): string {
    const m = PERIODE_RE.exec(p);
    if (!m) return p;
    return `${BULAN_NAMA[Number(m[2]) - 1]} ${m[1]}`;
}

/** Periode sebelumnya, mis. '2026-01' → '2025-12'. */
export function prevPeriode(p: string): string | undefined {
    const m = PERIODE_RE.exec(p);
    if (!m) return undefined;
    let y = Number(m[1]);
    let mo = Number(m[2]) - 1;
    if (mo < 1) { mo = 12; y -= 1; }
    return `${y}-${String(mo).padStart(2, '0')}`;
}

/** Daftar periode dari a s.d b (inklusif), maks 240 entri. */
export function periodeRange(a: string, b: string): string[] {
    if (!PERIODE_RE.test(a) || !PERIODE_RE.test(b) || a > b) return [];
    const out: string[] = [];
    let [y, m] = [Number(a.slice(0, 4)), Number(a.slice(5, 7))];
    while (`${y}-${String(m).padStart(2, '0')}` <= b && out.length < 240) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

/** 'YYYY-MM' untuk tanggal (waktu lokal). */
export function periodeOf(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Laporan dianggap "segar" bila periode terbarunya bulan ini atau bulan lalu. */
export function isLaporanFresh(list?: LaporanBulanan[], now: Date = new Date()): boolean {
    const latest = latestLaporan(list);
    const prev = prevPeriode(periodeOf(now));
    return !!latest && !!prev && latest.periode >= prev;
}

/**
 * Rencana hasil usaha s.d periode (dari rencana tahunan); undefined bila belum diisi.
 * Rencana pendapatan diambil dari Rencana Internal / raRkap (satu sumber dengan Kurva S).
 */
export function huRencanaPeriode(rencana: RencanaKurvaS[] | undefined, periode: string): HasilUsahaPeriode | undefined {
    const plan = rencana?.find(x => x.tahun === Number(periode.slice(0, 4)));
    if (!plan) return undefined;
    const r = plan.huRencana;
    const idx = Number(periode.slice(5, 7)) - 1;
    const pick = (a?: number[]) => (a && a.length === 12 ? a[idx] : undefined);
    const out: HasilUsahaPeriode = {
        pendapatan: pick(plan.raRkap), hpp: pick(r?.hpp), ebitda: pick(r?.ebitda), labaBersih: pick(r?.labaBersih),
    };
    return Object.values(out).some(v => v !== undefined) ? out : undefined;
}

export function sortLaporan<T extends { periode: string }>(list: T[]): T[] {
    return [...list].sort((a, b) => a.periode.localeCompare(b.periode));
}

export function latestLaporan<T extends { periode: string }>(list?: T[]): T | undefined {
    if (!list || list.length === 0) return undefined;
    return sortLaporan(list)[list.length - 1];
}

// ── Perhitungan EVM ──────────────────────────────────────────────────────────
export interface EvmResult {
    cpi?: number;   // BCWP / ACWP
    spi?: number;   // BCWP / BCWS
    cv?: number;    // BCWP − ACWP
    sv?: number;    // BCWP − BCWS
}

export function computeEvm(e?: EvmData): EvmResult {
    const { bcws, bcwp, acwp } = e ?? {};
    const has = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    return {
        cpi: has(bcwp) && has(acwp) && acwp > 0 ? bcwp / acwp : undefined,
        spi: has(bcwp) && has(bcws) && bcws > 0 ? bcwp / bcws : undefined,
        cv: has(bcwp) && has(acwp) ? bcwp - acwp : undefined,
        sv: has(bcwp) && has(bcws) ? bcwp - bcws : undefined,
    };
}

/**
 * Field "lama" di dokumen proyek yang DITURUNKAN dari laporan bulanan terbaru.
 * Dipakai server (sinkronisasi + menolak tulis langsung) dan klien (mengunci
 * input) supaya angka yang sama tidak perlu diketik di dua tempat.
 * Hanya field yang datanya tersedia yang muncul di hasil.
 */
export interface LegacyDerived {
    cpi?: number;
    spi?: number;
    tagihanBruto?: number;
    hasilUsaha?: { pendapatan: number; biaya: number; laba: number };
    pu?: number;                // = pendapatan s.d periode terbaru
    lk?: number;                // = PU − BK (BK tetap diisi manual: BK tidak sama dengan HPP)
    cashIn?: number;            // cashInAwal + Σ cashIn laporan s.d periode terbaru
    cashOut?: number;
    saldoHutang?: number;       // posisi keuangan laporan terbaru
    bad?: number;
    piutang?: number;
    ccc?: number;
}

/** Bagian dokumen proyek yang dibutuhkan untuk menurunkan field lama. */
export interface DeriveSource {
    laporanBulanan?: LaporanBulanan[];
    bk?: number;                // beban konstruksi (input manual), untuk menghitung LK
    cashInAwal?: number;
    cashOutAwal?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function derivedFromLaporan(src?: DeriveSource): LegacyDerived {
    const latest = latestLaporan(src?.laporanBulanan);
    if (!src || !latest) return {};
    const out: LegacyDerived = {};

    // EVM → CPI/SPI
    const { cpi, spi } = computeEvm(latest.evm);
    if (cpi !== undefined) out.cpi = Math.min(5, round2(cpi));
    if (spi !== undefined) out.spi = Math.min(5, round2(spi));

    // Posisi keuangan
    const ps = latest.posisi;
    if (ps) {
        if (typeof ps.saldoHutang === 'number') out.saldoHutang = ps.saldoHutang;
        if (typeof ps.bad === 'number') out.bad = ps.bad;
        if (typeof ps.piutang === 'number') out.piutang = ps.piutang;
        if (typeof ps.ccc === 'number') out.ccc = ps.ccc;
    }

    // Tagihan
    if (typeof latest.tagihanBruto === 'number') out.tagihanBruto = latest.tagihanBruto;

    // Hasil usaha s.d periode → PU. BK bukan HPP (dasar berbeda), jadi tetap diisi manual;
    // LK dihitung dari PU − BK bila BK sudah ada.
    const hu = latest.huSdBulanIni;
    if (hu && typeof hu.pendapatan === 'number') {
        out.pu = hu.pendapatan;
        if (typeof src.bk === 'number') out.lk = hu.pendapatan - src.bk;
        if (typeof hu.hpp === 'number') out.hasilUsaha = { pendapatan: hu.pendapatan, biaya: hu.hpp, laba: hu.pendapatan - hu.hpp };
    }

    // Kas: saldo awal + total arus bulanan s.d periode terbaru (semua tahun).
    const list = src.laporanBulanan ?? [];
    if (list.some(l => typeof l.cashIn === 'number')) {
        out.cashIn = (src.cashInAwal ?? 0) + list.reduce((a, l) => a + (l.periode <= latest.periode ? (l.cashIn ?? 0) : 0), 0);
    }
    if (list.some(l => typeof l.cashOut === 'number')) {
        out.cashOut = (src.cashOutAwal ?? 0) + list.reduce((a, l) => a + (l.periode <= latest.periode ? (l.cashOut ?? 0) : 0), 0);
    }
    return out;
}

/** HPP sebagai persen dari pendapatan; undefined bila tak bisa dihitung. */
export function hppPersen(hu?: HasilUsahaPeriode): number | undefined {
    if (!hu || typeof hu.hpp !== 'number' || typeof hu.pendapatan !== 'number' || hu.pendapatan <= 0) return undefined;
    return (hu.hpp / hu.pendapatan) * 100;
}

/** Total arus kas masuk/keluar semua bulan pada satu tahun, s.d periode (inklusif). */
export function cashflowKumulatif(list: LaporanBulanan[] | undefined, tahun: number, sampaiPeriode?: string) {
    let masuk = 0;
    let keluar = 0;
    for (const l of list ?? []) {
        if (!l.periode.startsWith(`${tahun}-`)) continue;
        if (sampaiPeriode && l.periode > sampaiPeriode) continue;
        masuk += l.cashIn ?? 0;
        keluar += l.cashOut ?? 0;
    }
    return { masuk, keluar, neto: masuk - keluar };
}

// ── Validasi / sanitasi (dipakai API; pesan Bahasa Indonesia) ────────────────
export type SanitizeResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isBlank = (v: unknown) => v === '' || v === null || v === undefined;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function readNum(
    v: unknown, label: string, errors: string[],
    opts: { min?: number; int?: boolean } = {},
): number | undefined {
    if (isBlank(v)) return undefined;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n)) { errors.push(`${label} harus berupa angka`); return undefined; }
    const min = opts.min ?? 0;
    if (n < min) { errors.push(min === 0 ? `${label} harus ≥ 0` : `${label} terlalu kecil`); return undefined; }
    if (n > MAX_VALUE) { errors.push(`${label} terlalu besar`); return undefined; }
    if (opts.int && !Number.isInteger(n)) { errors.push(`${label} harus bilangan bulat`); return undefined; }
    return n;
}

/** Hapus key undefined; kembalikan undefined bila objek kosong. */
function compact<T extends object>(o: T): T | undefined {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) if (val !== undefined) out[k] = val;
    return Object.keys(out).length ? (out as T) : undefined;
}

function readHu(raw: unknown, prefix: string, errors: string[]): HasilUsahaPeriode | undefined {
    if (!isObj(raw)) return undefined;
    return compact({
        pendapatan: readNum(raw.pendapatan, `${prefix} – Pendapatan`, errors),
        hpp: readNum(raw.hpp, `${prefix} – HPP`, errors),
        ebitda: readNum(raw.ebitda, `${prefix} – EBITDA`, errors, { min: -MAX_VALUE }),
        labaBersih: readNum(raw.labaBersih, `${prefix} – Laba bersih`, errors, { min: -MAX_VALUE }),
    });
}

export function sanitizeLaporan(raw: unknown): SanitizeResult<LaporanBulanan> {
    const errors: string[] = [];
    if (!isObj(raw)) return { ok: false, errors: ['Data laporan tidak valid'] };
    if (!isValidPeriode(raw.periode)) return { ok: false, errors: ['Periode harus berformat YYYY-MM (tahun 2000-2099)'] };

    const evmRaw = isObj(raw.evm) ? raw.evm : {};
    const evm = compact<EvmData>({
        bac: readNum(evmRaw.bac, 'BAC', errors),
        bcws: readNum(evmRaw.bcws, 'BCWS', errors),
        bcwp: readNum(evmRaw.bcwp, 'BCWP', errors),
        acwp: readNum(evmRaw.acwp, 'ACWP', errors),
    });

    const psRaw = isObj(raw.posisi) ? raw.posisi : {};
    const posisi = compact<PosisiKeuangan>({
        saldoHutang: readNum(psRaw.saldoHutang, 'Saldo hutang', errors),
        bad: readNum(psRaw.bad, 'BAD', errors),
        piutang: readNum(psRaw.piutang, 'Piutang', errors),
        ccc: readNum(psRaw.ccc, 'CCC', errors, { int: true }),
    });
    if (posisi?.ccc != null && posisi.ccc > 3650) errors.push('CCC terlalu besar (maks 3650 hari)');

    const pRaw = isObj(raw.pengadaan) ? raw.pengadaan : {};
    const pengadaan = compact<PengadaanData>({
        paketTotal: readNum(pRaw.paketTotal, 'Total paket', errors, { int: true }),
        paketRealisasi: readNum(pRaw.paketRealisasi, 'Paket terealisasi', errors, { int: true }),
        paguTotal: readNum(pRaw.paguTotal, 'Total pagu', errors),
        paguRealisasi: readNum(pRaw.paguRealisasi, 'Pagu terealisasi', errors),
    });
    if (pengadaan) {
        if (pengadaan.paketTotal != null && pengadaan.paketRealisasi != null && pengadaan.paketRealisasi > pengadaan.paketTotal) {
            errors.push('Paket terealisasi tidak boleh melebihi total paket');
        }
        if (pengadaan.paguTotal != null && pengadaan.paguRealisasi != null && pengadaan.paguRealisasi > pengadaan.paguTotal) {
            errors.push('Pagu terealisasi tidak boleh melebihi total pagu');
        }
    }

    if (errors.length) return { ok: false, errors };

    const value: LaporanBulanan = { periode: raw.periode };
    const set = <K extends keyof LaporanBulanan>(k: K, v: LaporanBulanan[K]) => { if (v !== undefined) value[k] = v; };
    set('evm', evm);
    set('huBulanIni', readHu(raw.huBulanIni, 'Hasil usaha bulan ini', errors));
    set('huSdBulanIni', readHu(raw.huSdBulanIni, 'Hasil usaha s.d bulan ini', errors));
    set('cashIn', readNum(raw.cashIn, 'Cash in', errors));
    set('cashOut', readNum(raw.cashOut, 'Cash out', errors));
    set('tagihanBruto', readNum(raw.tagihanBruto, 'Tagihan bruto', errors));
    set('targetTagihan', readNum(raw.targetTagihan, 'Target tagihan', errors));
    set('pengadaan', pengadaan);
    set('posisi', posisi);

    if (errors.length) return { ok: false, errors };
    return { ok: true, value };
}

function readSeries(raw: unknown, label: string, errors: string[], opts: { signed?: boolean; monotonic?: boolean } = {}): number[] {
    const monotonic = opts.monotonic ?? true;
    if (isBlank(raw)) return [];
    if (!Array.isArray(raw)) { errors.push(`${label} harus berupa daftar 12 bulan`); return []; }
    if (raw.length === 0) return [];
    if (raw.length !== 12) { errors.push(`${label} harus berisi 12 bulan (Jan–Des)`); return []; }
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
        const n = readNum(raw[i], `${label} ${BULAN_SINGKAT[i]}`, errors, opts.signed ? { min: -MAX_VALUE } : {});
        if (n === undefined) {
            if (isBlank(raw[i])) errors.push(`${label} ${BULAN_SINGKAT[i]} belum diisi`);
            return [];
        }
        out.push(n);
    }
    for (let i = 1; monotonic && i < 12; i++) {
        if (out[i] < out[i - 1]) {
            errors.push(`${label}: nilai kumulatif tidak boleh turun (${BULAN_SINGKAT[i - 1]} → ${BULAN_SINGKAT[i]})`);
            return [];
        }
    }
    return out;
}

export function sanitizeRencana(raw: unknown): SanitizeResult<RencanaKurvaS> {
    const errors: string[] = [];
    if (!isObj(raw)) return { ok: false, errors: ['Data rencana tidak valid'] };
    const tahun = Number(raw.tahun);
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) return { ok: false, errors: ['Tahun tidak valid (2000-2099)'] };

    const puRkap = readNum(raw.puRkap, 'Target PU RKAP', errors);
    const raRkap = readSeries(raw.raRkap, 'Rencana Internal', errors);
    const raEksternal = readSeries(raw.raEksternal, 'RA Eksternal', errors);
    const huRaw = isObj(raw.huRencana) ? raw.huRencana : {};
    const hu: HuRencanaSeries = {
        hpp: readSeries(huRaw.hpp, 'Rencana HPP', errors),
        ebitda: readSeries(huRaw.ebitda, 'Rencana EBITDA', errors, { signed: true, monotonic: false }),
        labaBersih: readSeries(huRaw.labaBersih, 'Rencana laba bersih', errors, { signed: true, monotonic: false }),
    };
    if (errors.length) return { ok: false, errors };

    const value: RencanaKurvaS = { tahun, raRkap, raEksternal };
    if (puRkap !== undefined) value.puRkap = puRkap;
    if (Object.values(hu).some(a => a.length === 12)) value.huRencana = hu;
    return { ok: true, value };
}

export interface SaldoAwal { cashInAwal?: number; cashOutAwal?: number }

export function sanitizeSaldoAwal(raw: unknown): SanitizeResult<SaldoAwal> {
    const errors: string[] = [];
    if (!isObj(raw)) return { ok: false, errors: ['Data saldo awal tidak valid'] };
    const value = compact<SaldoAwal>({
        cashInAwal: readNum(raw.cashInAwal, 'Cash in awal', errors),
        cashOutAwal: readNum(raw.cashOutAwal, 'Cash out awal', errors),
    }) ?? {};
    if (errors.length) return { ok: false, errors };
    return { ok: true, value };
}

// ── Seri Kurva S untuk grafik ────────────────────────────────────────────────
export interface KurvaSData {
    tahun: number;
    /** 12 nilai (Jan..Des) dalam persen terhadap basis; undefined = belum ada data. */
    rkap: (number | undefined)[];
    eksternal: (number | undefined)[];
    ri: (number | undefined)[];
    /** Basis persen dalam rupiah (nilai kontrak, atau nilai terbesar di seri bila kontrak kosong). */
    basis: number;
    basisFromContract: boolean;
    /** Pendapatan usaha s.d periode terbaru (tahun yang sama) dan target PU RKAP, untuk penanda "PU vs RKAP". */
    pu?: number;
    puRkap?: number;
}

/**
 * Seri Kurva S satu tahun, dalam persen terhadap nilai kontrak. Tahun default =
 * tahun laporan terbaru (atau rencana terbaru). Bila nilai kontrak kosong, basis
 * = nilai terbesar di seri. undefined bila tak ada data sama sekali.
 */
export function kurvaSSeries(
    src: { laporanBulanan?: LaporanBulanan[]; rencanaKurvaS?: RencanaKurvaS[]; contractValue?: number } | undefined,
    tahun?: number,
): KurvaSData | undefined {
    if (!src) return undefined;
    const latest = latestLaporan(src.laporanBulanan);
    const yr = tahun
        ?? (latest ? Number(latest.periode.slice(0, 4)) : [...(src.rencanaKurvaS ?? [])].sort((a, b) => b.tahun - a.tahun)[0]?.tahun);
    if (yr === undefined) return undefined;

    const plan = src.rencanaKurvaS?.find(r => r.tahun === yr);
    const raw = {
        rkap: (plan?.raRkap.length === 12 ? plan.raRkap : Array(12).fill(undefined)) as (number | undefined)[],
        eksternal: (plan?.raEksternal.length === 12 ? plan.raEksternal : Array(12).fill(undefined)) as (number | undefined)[],
        ri: Array<number | undefined>(12).fill(undefined),
    };
    // RI (realisasi) = pendapatan usaha s.d bulan itu: Kurva S berbasis PU, satu data dengan Hasil Usaha.
    for (const l of src.laporanBulanan ?? []) {
        const pu = l.huSdBulanIni?.pendapatan;
        if (l.periode.startsWith(`${yr}-`) && typeof pu === 'number') raw.ri[Number(l.periode.slice(5, 7)) - 1] = pu;
    }

    const all = [...raw.rkap, ...raw.eksternal, ...raw.ri].filter((v): v is number => typeof v === 'number');
    if (all.length === 0) return undefined;
    const basis = src.contractValue && src.contractValue > 0 ? src.contractValue : Math.max(...all);
    if (!(basis > 0)) return undefined;
    const pct = (a: (number | undefined)[]) => a.map(v => (typeof v === 'number' ? (v / basis) * 100 : undefined));
    const sameYear = !!latest && latest.periode.startsWith(`${yr}-`);
    return {
        tahun: yr, rkap: pct(raw.rkap), eksternal: pct(raw.eksternal), ri: pct(raw.ri),
        basis, basisFromContract: !!(src.contractValue && src.contractValue > 0),
        pu: sameYear ? latest?.huSdBulanIni?.pendapatan : undefined,
        puRkap: plan?.puRkap,
    };
}

// ── Seri arus kas bulanan untuk grafik ───────────────────────────────────────
export interface CashflowPoint { bulan: number; masuk?: number; keluar?: number }   // bulan: 0..11

/** Arus kas per bulan pada satu tahun (default: tahun laporan terbaru) + total. */
export function cashflowSeries(list: LaporanBulanan[] | undefined, tahun?: number):
    { tahun: number; points: CashflowPoint[]; masuk: number; keluar: number } | undefined {
    const latest = latestLaporan(list);
    const yr = tahun ?? (latest ? Number(latest.periode.slice(0, 4)) : undefined);
    if (yr === undefined) return undefined;
    const points = sortLaporan((list ?? []).filter(l => l.periode.startsWith(`${yr}-`) && (typeof l.cashIn === 'number' || typeof l.cashOut === 'number')))
        .map(l => ({ bulan: Number(l.periode.slice(5, 7)) - 1, masuk: l.cashIn, keluar: l.cashOut }));
    if (points.length === 0) return undefined;
    return {
        tahun: yr,
        points,
        masuk: points.reduce((a, p) => a + (p.masuk ?? 0), 0),
        keluar: points.reduce((a, p) => a + (p.keluar ?? 0), 0),
    };
}
