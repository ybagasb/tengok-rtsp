/**
 * Laporan "Update Pengisian Proyek" per divisi.
 *
 * File MURNI (tanpa mongoose / next) supaya aman dipakai route API, halaman admin,
 * dan pembuat PDF di browser.
 *
 * CATATAN: ini BUKAN indikator kelengkapan di halaman /project/[id]
 * (`computeCompleteness`, 11 butir). Laporan ini memakai 18 dimensi data dan aturan
 * "terisi" yang lebih ketat: angka 0, string kosong, null, dan array kosong dianggap
 * BELUM diisi (progres fisik default 0 di database, jadi 0 = belum diisi).
 * Angkanya sengaja dipertahankan sama dengan PDF rekap yang sudah beredar ke PIC.
 */

export const DIVISI_LIST = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'] as const;
export type DivisiKey = (typeof DIVISI_LIST)[number];

export function isDivisiKey(v: unknown): v is DivisiKey {
    return typeof v === 'string' && (DIVISI_LIST as readonly string[]).includes(v);
}

/** Bentuk minimal dokumen Location yang dibutuhkan untuk menghitung pengisian. */
export interface PengisianSumber {
    _id?: unknown;
    name: string;
    description?: string;
    category?: string;
    status?: string;
    penggunaJasa?: string;
    penyediaJasa?: string;
    pmName?: string;
    startDate?: unknown;
    endDate?: unknown;
    contractNumber?: string;
    contractValue?: number;
    progressPercent?: number;
    progressRencana?: number;
    tagihanBruto?: number;
    cashIn?: number;
    cashOut?: number;
    saldoHutang?: number;
    piutang?: number;
    cpi?: number;
    spi?: number;
    pu?: number;
    bk?: number;
    progressMinggu?: unknown[];
    progressKeuangan?: unknown[];
    milestones?: unknown[];
    sumberDaya?: unknown[];
    lingkupPekerjaan?: unknown[];
    laporanBulanan?: unknown[];
    qhsse?: Record<string, unknown>;
    gallery?: unknown[];
    documents?: unknown[];
}

/** Field Location yang perlu di-select dari database (selaras dengan PengisianSumber). */
export const PENGISIAN_FIELDS =
    '_id name description category status penggunaJasa penyediaJasa pmName startDate endDate ' +
    'contractNumber contractValue progressPercent progressRencana tagihanBruto cashIn cashOut ' +
    'saldoHutang piutang cpi spi pu bk progressMinggu progressKeuangan milestones sumberDaya ' +
    'lingkupPekerjaan laporanBulanan qhsse gallery documents';

/** Terisi = bukan null/undefined/''/0. */
const ada = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && v !== 0;
const adaItem = (a: unknown): boolean => Array.isArray(a) && a.length > 0;

interface Dimensi {
    label: string;
    ok: (p: PengisianSumber) => boolean;
}

export const DIMENSI: readonly Dimensi[] = [
    { label: 'Info Proyek', ok: p => [p.penggunaJasa, p.penyediaJasa, p.pmName].some(ada) },
    { label: 'Tanggal Kontrak', ok: p => ada(p.startDate) && ada(p.endDate) },
    { label: 'No. Kontrak', ok: p => ada(p.contractNumber) },
    { label: 'Nilai Kontrak', ok: p => ada(p.contractValue) },
    { label: 'Progres Fisik', ok: p => ada(p.progressPercent) },
    { label: 'Progres Rencana', ok: p => ada(p.progressRencana) },
    { label: 'Finansial', ok: p => [p.tagihanBruto, p.cashIn, p.cashOut, p.saldoHutang, p.piutang].some(ada) },
    { label: 'Ikhtiar CPI/SPI', ok: p => ada(p.cpi) && ada(p.spi) },
    { label: 'Kinerja (PU/BK)', ok: p => ada(p.pu) || ada(p.bk) },
    { label: 'Progres Mingguan', ok: p => adaItem(p.progressMinggu) },
    { label: 'Progres Keuangan DIPA', ok: p => adaItem(p.progressKeuangan) },
    { label: 'Milestone', ok: p => adaItem(p.milestones) },
    { label: 'Sumber Daya', ok: p => adaItem(p.sumberDaya) },
    { label: 'Lingkup Pekerjaan', ok: p => adaItem(p.lingkupPekerjaan) },
    { label: 'Laporan Bulanan', ok: p => adaItem(p.laporanBulanan) },
    { label: 'QHSSE', ok: p => !!p.qhsse && Object.values(p.qhsse).some(adaItem) },
    { label: 'Galeri', ok: p => adaItem(p.gallery) },
    { label: 'Dokumen', ok: p => adaItem(p.documents) },
];

export const DIMENSI_LABELS: readonly string[] = DIMENSI.map(d => d.label);
export const TOTAL_DIMENSI = DIMENSI.length;

/** Satu baris proyek pada laporan (bentuk yang dikirim API ke klien). */
export interface BarisPengisian {
    id: string;
    /** Nama singkat (Location.name), yang tampil di aplikasi. */
    name: string;
    /** Nama lengkap (Location.description); null bila kosong atau sama dengan nama singkat. */
    fullName: string | null;
    category: string;
    status: string;
    /** Sejajar dengan DIMENSI_LABELS: true = sudah diisi. */
    checks: boolean[];
    terisi: number;
}

export function hitungBaris(p: PengisianSumber): BarisPengisian {
    const checks = DIMENSI.map(d => d.ok(p));
    const desc = (p.description ?? '').trim();
    return {
        id: String(p._id ?? ''),
        name: p.name,
        fullName: desc && desc.toLowerCase() !== p.name.trim().toLowerCase() ? desc : null,
        category: p.category ?? '',
        status: p.status ?? '',
        checks,
        terisi: checks.filter(Boolean).length,
    };
}

export interface RingkasanPengisian {
    total: number;
    lengkap: number;
    belumMulai: number;
    dimensiKosong: number;
    dimensiTotal: number;
    /** Rata-rata pengisian, 0..100 (dibulatkan). */
    rata: number;
}

export function ringkas(baris: readonly BarisPengisian[]): RingkasanPengisian {
    const total = baris.length;
    const dimensiTotal = total * TOTAL_DIMENSI;
    const dimensiKosong = baris.reduce((acc, b) => acc + (TOTAL_DIMENSI - b.terisi), 0);
    return {
        total,
        lengkap: baris.filter(b => b.terisi === TOTAL_DIMENSI).length,
        belumMulai: baris.filter(b => b.terisi === 0).length,
        dimensiKosong,
        dimensiTotal,
        rata: dimensiTotal === 0 ? 0 : Math.round(((dimensiTotal - dimensiKosong) / dimensiTotal) * 100),
    };
}

/** Urutan tampilan: paling sedikit terisi di atas, lalu menurut nama. */
export function urutkanKurangTerisi(baris: readonly BarisPengisian[]): BarisPengisian[] {
    return [...baris].sort((a, b) => a.terisi - b.terisi || a.name.localeCompare(b.name, 'id'));
}

export function dimensiBelumDiisi(b: BarisPengisian): string[] {
    return DIMENSI_LABELS.filter((_, i) => !b.checks[i]);
}

export function persen(b: BarisPengisian): number {
    return Math.round((b.terisi / TOTAL_DIMENSI) * 100);
}

/** Bentuk respons GET /api/admin/pengisian. */
export interface PengisianResponse {
    success: true;
    generatedAt: string;
    dimensi: string[];
    divisi: Record<DivisiKey, BarisPengisian[]>;
    /** Jumlah proyek yang divisinya kosong/tidak dikenal (tidak masuk laporan mana pun). */
    tanpaDivisi: number;
}

/** "Jumat 13 November 2026, pukul 13.48" (WIB). */
export function formatWaktuWib(iso: string): string {
    const parts = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${g('weekday')} ${g('day')} ${g('month')} ${g('year')}, pukul ${g('hour')}.${g('minute')}`;
}

/** "2026-11-13-1348" (WIB), untuk nama file. */
export function stempelFile(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${g('year')}-${g('month')}-${g('day')}-${g('hour')}${g('minute')}`;
}
