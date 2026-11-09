/**
 * QHSSE (Quality, Health, Safety, Security, Environment) — definisi 9 dimensi,
 * util seri waktu bulanan, dan pemformat. MURNI (tanpa mongoose/React) supaya
 * aman dipakai API, tab detail proyek, dan CameraPanel.
 *
 * Data disimpan di Location.qhsse sebagai deret bulanan (periode "YYYY-MM").
 * NC & QPASS mengikuti struktur aplikasi QHSSE (Kevin) agar kelak mudah di-import.
 */

export interface QhsseNc { periode: string; totalNC?: number; open?: number; closed?: number; totalCost?: number }
export interface QhsseQpass { periode: string; struktur?: number; arsitektur?: number; mep?: number; overall?: number }
/** Giat Bersih 5R (Dashboard Asrofi): jumlah laporan & rata-rata durasi per bulan. */
export interface QhsseR5 { periode: string; jumlah?: number; durasi?: number; catatan?: string }
export interface QhsseNilai {
    periode: string;
    nilai?: number;         // nilai hasil (untuk TRIR & Energi: dihitung otomatis dari elemen di bawah)
    catatan?: string;
    // Elemen rumus TRIR = (incidents × 200.000) ÷ workHours
    incidents?: number;     // jumlah insiden tercatat (recordable)
    workHours?: number;     // total jam kerja (tahunan)
    // Elemen rumus Efisiensi Energi = (energyKwh ÷ areaM2) × 100%
    energyKwh?: number;     // total pemakaian energi listrik (kWh)
    areaM2?: number;        // luas bangunan (m²)
}
export interface QhsseData {
    nc?: QhsseNc[];
    qpass?: QhsseQpass[];
    trir?: QhsseNilai[];
    smk3l?: QhsseNilai[];
    r5?: QhsseR5[];
    pak?: QhsseNilai[];
    energi?: QhsseNilai[];
    keamanan?: QhsseNilai[];
}

/** Kunci deret data yang disimpan (NC dipakai bersama oleh dimensi "NC Status" & "Cost of NC"). */
export type QhsseKey = keyof QhsseData;
export type QhsseDimId = 'nc' | 'cost' | 'qpass' | 'trir' | 'smk3l' | 'r5' | 'pak' | 'energi' | 'keamanan';

export type QhsseBidang = 'Quality' | 'Safety' | 'Health' | 'Environment' | 'Security';

/** Glosarium dimensi (definisi + rumus bila ada di RKA QHSSE 2025). */
export interface QhsseGlossary {
    definisi: string;       // penjelasan singkat istilah
    rumus?: string;         // rumus perhitungan (hanya untuk dimensi yang punya)
}

export interface QhsseDim {
    id: QhsseDimId;
    key: QhsseKey;          // deret yang menyimpan datanya
    label: string;          // label lengkap
    short: string;          // label pill
    bidang: QhsseBidang;
    unit: string;           // satuan untuk tampilan ('' = angka polos)
    lowerBetter: boolean;   // true: turun = membaik
    hint?: string;
    glossary?: QhsseGlossary; // definisi + rumus untuk tooltip "?"
    sumber?: string;        // catatan sumber data
}

export const QHSSE_DIMS: QhsseDim[] = [
    { id: 'nc', key: 'nc', label: 'NC Status', short: 'NC Status', bidang: 'Quality', unit: '', lowerBetter: true, hint: 'Ringkasan temuan Non-Conformance per bulan: total, open, closed.', sumber: 'Aplikasi QHSSE (sementara diinput manual)',
        glossary: { definisi: 'NC (Non-Conformance) adalah temuan ketidaksesuaian terhadap standar/spesifikasi. Status menunjukkan jumlah temuan per bulan: total, yang masih terbuka (open), dan yang sudah ditutup (closed).' } },
    { id: 'cost', key: 'nc', label: 'Cost of NC', short: 'Cost of NC', bidang: 'Quality', unit: 'Rp', lowerBetter: true, hint: 'Total biaya perbaikan seluruh NC pada bulan tersebut.', sumber: 'Aplikasi QHSSE (sementara diinput manual)',
        glossary: { definisi: 'Total biaya penanganan/perbaikan seluruh temuan Non-Conformance (NC) pada bulan tersebut.' } },
    { id: 'qpass', key: 'qpass', label: 'QPASS', short: 'QPASS', bidang: 'Quality', unit: '', lowerBetter: false, hint: 'Skor QPASS per domain (0–100). Overall dihitung rata-rata bila tidak diisi.', sumber: 'Aplikasi QHSSE (sementara diinput manual)',
        glossary: { definisi: 'QPASS (Quality Pass) adalah skor mutu hasil konstruksi per domain (struktur, arsitektur, MEP). Skor overall dihitung rata-rata bila tidak diisi.', rumus: 'Rumus korporat: (Rata-rata hasil pengukuran QPASS proyek ÷ Total Proyek) × 100%' } },
    { id: 'trir', key: 'trir', label: 'TRIR (Total Recordable Injury Rate)', short: 'TRIR', bidang: 'Safety', unit: '', lowerBetter: true, hint: 'Angka laju kecelakaan kerja tercatat. Makin kecil makin baik.',
        glossary: { definisi: 'TRIR (Total Recordable Injury Rate) adalah angka laju kecelakaan kerja tercatat per 200.000 jam kerja. Isi jumlah insiden tercatat dan total jam kerja — sistem menghitung TRIR otomatis. Makin kecil makin baik.', rumus: '(Total Recordable Incidents × 200.000) ÷ Total Jam Kerja Tahunan' } },
    { id: 'smk3l', key: 'smk3l', label: 'Score SMK3L', short: 'SMK3L', bidang: 'Safety', unit: '', lowerBetter: false, hint: 'Skor penerapan SMK3L (PP 50/2012), 0–100.',
        glossary: { definisi: 'Skor penerapan Sistem Manajemen Keselamatan, Kesehatan Kerja & Lingkungan (SMK3L) mengacu PP 50/2012, skala 0–100.', rumus: 'Rumus korporat: (Rata-rata pengukuran SMK3L proyek ÷ Total Proyek) × 100%' } },
    { id: 'r5', key: 'r5', label: 'Giat Bersih 5R (Jumlah & Durasi)', short: '5R', bidang: 'Environment', unit: 'laporan', lowerBetter: false, hint: 'Jumlah laporan giat bersih 5R dan rata-rata durasinya (menit) pada bulan itu, mengikuti Dashboard Monitoring Giat Bersih 5R.', sumber: 'Dashboard Asrofi (belum terhubung, sementara data dummy/manual)',
        glossary: { definisi: '5R adalah budaya kerja Ringkas, Rapi, Resik, Rawat, Rajin. Dimensi ini mencatat jumlah laporan Giat Bersih 5R dan rata-rata durasinya (menit) per bulan.' } },
    { id: 'pak', key: 'pak', label: 'Jumlah PAK (Penyakit Akibat Kerja)', short: 'PAK', bidang: 'Health', unit: 'kasus', lowerBetter: true,
        glossary: { definisi: 'PAK (Penyakit Akibat Kerja) adalah penyakit yang disebabkan oleh pekerjaan atau lingkungan kerja. Dimensi ini mencatat jumlah kasus PAK.', rumus: 'Rumus korporat: (Jumlah Kasus PAK ÷ Total Proyek) × 100%' } },
    { id: 'energi', key: 'energi', label: 'Kepatuhan Efisiensi Energi', short: 'Efisiensi Energi', bidang: 'Environment', unit: '%', lowerBetter: false, hint: 'Persentase kepatuhan efisiensi energi, 0–100.',
        glossary: { definisi: 'Tingkat efisiensi penggunaan energi listrik terhadap luas bangunan. Isi total pemakaian energi (kWh) dan luas bangunan (m²) — sistem menghitung persentasenya otomatis.', rumus: '(Total pemakaian energi listrik ÷ luas bangunan) × 100%' } },
    { id: 'keamanan', key: 'keamanan', label: 'Kasus Penyimpangan Keamanan', short: 'Keamanan', bidang: 'Security', unit: 'kasus', lowerBetter: true, hint: 'Jumlah kejadian penyimpangan keamanan (mis. kehilangan aset/pencurian).',
        glossary: { definisi: 'Jumlah kejadian penyimpangan keamanan (mis. kehilangan aset, pencurian, akses tanpa izin) yang tercatat.', rumus: 'Jumlah kasus penyimpangan keamanan' } },
];

export const QHSSE_DIM_BY_ID = Object.fromEntries(QHSSE_DIMS.map(d => [d.id, d])) as Record<QhsseDimId, QhsseDim>;

export const PERIODE_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "2026-10" → "Okt 26". */
export function periodeShort(p: string): string {
    if (!PERIODE_RE.test(p)) return p;
    return `${BLN[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
}
/** "2026-10" → "Okt 2026". */
export function periodeFull(p: string): string {
    if (!PERIODE_RE.test(p)) return p;
    return `${BLN[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
}
/** Bulan setelah periode (atau bulan ini bila kosong). */
export function nextPeriode(last?: string, now: Date = new Date()): string {
    if (last && PERIODE_RE.test(last)) {
        const y = Number(last.slice(0, 4)), m = Number(last.slice(5, 7));
        return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Overall QPASS: nilai yang diisi, jika kosong rata-rata domain yang terisi. */
export function qpassOverall(e: QhsseQpass): number | undefined {
    if (typeof e.overall === 'number') return e.overall;
    const v = [e.struktur, e.arsitektur, e.mep].filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

/**
 * TRIR dihitung dari elemen rumus: (insiden tercatat × 200.000) ÷ total jam kerja.
 * Jika elemen tak lengkap, pakai nilai tersimpan (data lama yang diinput manual).
 */
export function trirValue(e: QhsseNilai): number | undefined {
    const { incidents, workHours } = e;
    if (typeof incidents === 'number' && typeof workHours === 'number' && workHours > 0) {
        return (incidents * 200_000) / workHours;
    }
    return typeof e.nilai === 'number' ? e.nilai : undefined;
}

/**
 * Efisiensi Energi dihitung dari elemen rumus: (energi listrik kWh ÷ luas m²) × 100%.
 * Jika elemen tak lengkap, pakai nilai tersimpan (data lama yang diinput manual).
 */
export function energiValue(e: QhsseNilai): number | undefined {
    const { energyKwh, areaM2 } = e;
    if (typeof energyKwh === 'number' && typeof areaM2 === 'number' && areaM2 > 0) {
        return (energyKwh / areaM2) * 100;
    }
    return typeof e.nilai === 'number' ? e.nilai : undefined;
}

/** Nilai hasil satu baris dimensi (menghormati rumus TRIR/Energi). */
export function computedNilai(dim: QhsseDimId, e: QhsseNilai): number | undefined {
    if (dim === 'trir') return trirValue(e);
    if (dim === 'energi') return energiValue(e);
    return typeof e.nilai === 'number' ? e.nilai : undefined;
}

export interface QhssePoint { periode: string; v: number }
export interface QhsseSeries { name: string; color: string; points: QhssePoint[] }

const C_ACCENT = 'rgb(var(--div-accent-rgb))';
const C_BLUE = '#38bdf8';
const C_ORANGE = '#fb923c';
const C_GREEN = '#34d399';
const C_ROSE = '#fb7185';

const pts = <T extends { periode: string }>(rows: T[] | undefined, pick: (r: T) => number | undefined): QhssePoint[] =>
    (rows ?? []).flatMap(r => { const v = pick(r); return typeof v === 'number' && Number.isFinite(v) ? [{ periode: r.periode, v }] : []; })
        .sort((a, b) => a.periode.localeCompare(b.periode));

/** Seri garis untuk satu dimensi (urut periode naik). Seri pertama = seri utama. */
export function seriesFor(dim: QhsseDimId, q: QhsseData | undefined): QhsseSeries[] {
    const d = q ?? {};
    switch (dim) {
        case 'nc': return [
            { name: 'Open', color: C_ROSE, points: pts(d.nc, r => r.open) },
            { name: 'Closed', color: C_GREEN, points: pts(d.nc, r => r.closed) },
            { name: 'Total NC', color: C_ACCENT, points: pts(d.nc, r => r.totalNC) },
        ];
        case 'cost': return [{ name: 'Cost of NC', color: C_ACCENT, points: pts(d.nc, r => r.totalCost) }];
        case 'qpass': return [
            { name: 'Overall', color: C_ACCENT, points: pts(d.qpass, qpassOverall) },
            { name: 'Struktur', color: C_BLUE, points: pts(d.qpass, r => r.struktur) },
            { name: 'Arsitektur', color: C_ORANGE, points: pts(d.qpass, r => r.arsitektur) },
            { name: 'MEP', color: C_GREEN, points: pts(d.qpass, r => r.mep) },
        ];
        case 'r5': return [
            { name: 'Jumlah laporan', color: C_ACCENT, points: pts(d.r5, r => r.jumlah) },
            { name: 'Rata-rata durasi (mnt)', color: C_BLUE, points: pts(d.r5, r => r.durasi) },
        ];
        case 'trir': return [{ name: 'TRIR', color: C_ACCENT, points: pts(d.trir, trirValue) }];
        case 'energi': return [{ name: 'Efisiensi Energi', color: C_ACCENT, points: pts(d.energi, energiValue) }];
        default: {
            const meta = QHSSE_DIM_BY_ID[dim];
            return [{ name: meta.short, color: C_ACCENT, points: pts(d[meta.key] as QhsseNilai[] | undefined, r => (r as QhsseNilai).nilai) }];
        }
    }
}

export function fmtNum(v: number, digits = 2): string {
    return v.toLocaleString('id-ID', { maximumFractionDigits: digits });
}

/** Rupiah ringkas untuk Cost of NC. */
export function fmtRupiah(v: number): string {
    const a = Math.abs(v);
    const f = (n: number, d: number) => n.toLocaleString('id-ID', { maximumFractionDigits: d });
    if (a >= 1_000_000_000) return `Rp ${f(v / 1_000_000_000, 2)} M`;
    if (a >= 1_000_000) return `Rp ${f(v / 1_000_000, 2)} Jt`;
    return `Rp ${f(v, 0)}`;
}

export function fmtValue(dim: QhsseDimId, v: number | undefined): string {
    if (v == null || !Number.isFinite(v)) return '-';
    switch (dim) {
        case 'cost': return fmtRupiah(v);
        case 'energi': return `${fmtNum(v, 1)}%`;
        case 'nc': case 'pak': case 'keamanan': return fmtNum(v, 0);
        case 'r5': return fmtNum(v, 1);
        default: return fmtNum(v, 2);
    }
}

export interface QhsseSummary {
    periode?: string;       // periode nilai terbaru
    latest?: number;
    prev?: number;
    delta?: number;         // latest - prev
    /** 'good' = membaik, 'bad' = memburuk, 'flat' = tetap, undefined = belum ada pembanding. */
    trend?: 'good' | 'bad' | 'flat';
}

/** Ringkasan nilai terbaru vs bulan sebelumnya pada seri utama. */
export function summarize(dim: QhsseDimId, q: QhsseData | undefined): QhsseSummary {
    // Seri utama = seri pertama (untuk NC Status: jumlah NC yang masih open).
    const p = seriesFor(dim, q)[0].points;
    if (!p.length) return {};
    const last = p[p.length - 1];
    const prev = p.length > 1 ? p[p.length - 2] : undefined;
    if (!prev) return { periode: last.periode, latest: last.v };
    const delta = last.v - prev.v;
    const lowerBetter = QHSSE_DIM_BY_ID[dim].lowerBetter;
    const trend = delta === 0 ? 'flat' : (delta < 0) === lowerBetter ? 'good' : 'bad';
    return { periode: last.periode, latest: last.v, prev: prev.v, delta, trend };
}

/** Jumlah dimensi yang sudah punya minimal satu data bulanan (untuk indikator kelengkapan). */
export function filledCount(q: QhsseData | undefined): number {
    return QHSSE_DIMS.filter(d => seriesFor(d.id, q).some(s => s.points.length > 0)).length;
}

/** Baris data terbaru (periode terbesar) dari satu deret bulanan. */
export function latestRow<T extends { periode: string }>(rows?: T[]): T | undefined {
    return rows?.length ? [...rows].sort((a, b) => a.periode.localeCompare(b.periode))[rows.length - 1] : undefined;
}

/** Selisih nilai terbaru vs bulan sebelumnya untuk satu seri (mis. seri durasi 5R). */
export function deltaOf(points: QhssePoint[], lowerBetter: boolean): { delta: number; trend: 'good' | 'bad' | 'flat' } | undefined {
    if (points.length < 2) return undefined;
    const delta = points[points.length - 1].v - points[points.length - 2].v;
    return { delta, trend: delta === 0 ? 'flat' : (delta < 0) === lowerBetter ? 'good' : 'bad' };
}

/** Baris keterangan tambahan di kartu ringkasan (nilai terbaru yang tidak muat di angka utama). */
export function detailText(dim: QhsseDimId, q: QhsseData | undefined): string | undefined {
    const last = <T extends { periode: string }>(rows?: T[]) =>
        rows?.length ? [...rows].sort((a, b) => a.periode.localeCompare(b.periode))[rows.length - 1] : undefined;
    const f = (v?: number) => (v == null ? '-' : fmtNum(v, 2));
    if (dim === 'nc' || dim === 'cost') {
        const r = last(q?.nc);
        if (!r) return undefined;
        return dim === 'nc'
            ? `Total ${f(r.totalNC)} · Closed ${f(r.closed)}`
            : `Total NC ${f(r.totalNC)} · Open ${f(r.open)}`;
    }
    if (dim === 'r5') {
        const r = last(q?.r5);
        return r?.durasi != null ? `Rata-rata durasi ${fmtNum(r.durasi, 1)} mnt` : undefined;
    }
    if (dim === 'qpass') {
        const r = last(q?.qpass);
        return r ? `Str ${f(r.struktur)} · Ars ${f(r.arsitektur)} · MEP ${f(r.mep)}` : undefined;
    }
    return undefined;
}

/** Dua kelompok dimensi untuk ringkasan halaman detail (baris atas 5 kartu, baris bawah 4 kartu). */
export const QHSSE_GROUPS: { id: 'mutu-k3' | 'lingkungan'; title: string; ids: QhsseDimId[] }[] = [
    { id: 'mutu-k3', title: 'Quality & Safety', ids: ['nc', 'cost', 'qpass', 'trir', 'smk3l'] },
    { id: 'lingkungan', title: 'Health, Environment & Security', ids: ['pak', 'r5', 'energi', 'keamanan'] },
];
