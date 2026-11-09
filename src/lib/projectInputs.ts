/**
 * Validasi & sanitasi sub-dokumen detail proyek (milestone, sumber daya, kendala, dst).
 *
 * File ini MURNI (tanpa mongoose) supaya aman dipakai API route. Setiap fungsi
 * mengembalikan nilai bersih dan MENAMBAH pesan galat (Bahasa Indonesia, menyebut
 * baris ke-N) ke `errors` bila ada isian salah — tidak membuang diam-diam.
 */

const MAX_ROWS = 200;
const MAX_STR = 10000;
const MAX_VALUE = 1e15;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v: unknown) => v === '' || v === null || v === undefined;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

function rows(raw: unknown, label: string, errors: string[]): Record<string, unknown>[] | null {
    if (isBlank(raw)) return [];
    if (!Array.isArray(raw)) { errors.push(`${label} harus berupa daftar`); return null; }
    if (raw.length > MAX_ROWS) { errors.push(`${label} terlalu banyak (maks ${MAX_ROWS} baris)`); return null; }
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < raw.length; i++) {
        if (!isObj(raw[i])) { errors.push(`${label} #${i + 1}: format tidak valid`); return null; }
        out.push(raw[i] as Record<string, unknown>);
    }
    return out;
}

function tooLong(v: string, label: string, errors: string[]): boolean {
    if (v.length > MAX_STR) { errors.push(`${label} terlalu panjang (maks ${MAX_STR} karakter)`); return true; }
    return false;
}

function num(v: unknown, label: string, errors: string[], opts: { min?: number; max?: number; int?: boolean } = {}): number | undefined {
    if (isBlank(v)) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) { errors.push(`${label} harus berupa angka`); return undefined; }
    if (opts.min != null && n < opts.min) { errors.push(`${label} minimal ${opts.min}`); return undefined; }
    if (opts.max != null && n > opts.max) { errors.push(`${label} maksimal ${opts.max}`); return undefined; }
    if (Math.abs(n) > MAX_VALUE) { errors.push(`${label} terlalu besar`); return undefined; }
    if (opts.int && !Number.isInteger(n)) { errors.push(`${label} harus bilangan bulat`); return undefined; }
    return n;
}

function dateOrUndef(v: unknown, label: string, errors: string[]): string | undefined {
    if (isBlank(v)) return undefined;
    const d = new Date(v as string);
    if (Number.isNaN(d.getTime())) { errors.push(`${label} tidak valid`); return undefined; }
    return typeof v === 'string' ? v : d.toISOString();
}

/** Nomor telepon: 8–15 digit, boleh diawali + dan berisi spasi, tanda hubung, titik, kurung. */
export function validPhone(v: string): boolean {
    if (!/^\+?[\d\s().-]+$/.test(v)) return false;
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
}

export function sanitizeMilestones(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Milestone', errors);
    if (!list) return undefined;
    return list.map((r, i) => {
        const L = `Milestone #${i + 1}`;
        const title = str(r.title);
        if (!title) errors.push(`${L}: judul wajib diisi`);
        tooLong(title, `${L}: judul`, errors);
        const progress = num(r.progress ?? (r.done ? 100 : 0), `${L}: progres`, errors, { min: 0, max: 100 }) ?? 0;
        const date = dateOrUndef(r.date, `${L}: tanggal`, errors);
        const out: Record<string, unknown> = { title, progress: Math.round(progress), done: progress >= 100 };
        if (date) out.date = date;
        return out;
    });
}

export function sanitizeSumberDaya(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Sumber daya', errors);
    if (!list) return undefined;
    return list.map((r, i) => {
        const L = `Sumber daya #${i + 1}`;
        const namaAlat = str(r.namaAlat);
        if (!namaAlat) errors.push(`${L}: nama wajib diisi`);
        tooLong(namaAlat, `${L}: nama`, errors);
        const jumlah = num(r.jumlah, `${L}: jumlah`, errors, { min: 0 }) ?? 0;
        const out: Record<string, unknown> = { namaAlat, jumlah };
        const kategori = str(r.kategori);
        const satuan = str(r.satuan);
        if (kategori) out.kategori = kategori;
        if (satuan) out.satuan = satuan;
        return out;
    });
}

const PERIODE_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

function periodeOf(r: Record<string, unknown>, L: string, errors: string[], seen: Set<string>): string {
    const p = str(r.periode);
    if (!PERIODE_RE.test(p)) errors.push(`${L}: periode tidak valid (format YYYY-MM)`);
    else if (seen.has(p)) errors.push(`${L}: periode ${p} duplikat`);
    seen.add(p);
    return p;
}

type QhsseNilaiKey = 'trir' | 'smk3l' | 'pak' | 'energi' | 'keamanan';
const QHSSE_NILAI: { key: QhsseNilaiKey; label: string; max?: number; int?: boolean }[] = [
    { key: 'trir', label: 'TRIR' },
    { key: 'smk3l', label: 'Score SMK3L', max: 100 },
    { key: 'pak', label: 'Jumlah PAK', int: true },
    { key: 'energi', label: 'Kepatuhan Efisiensi Energi', max: 100 },
    { key: 'keamanan', label: 'Kasus Penyimpangan Keamanan', int: true },
];

/** QHSSE: objek berisi deret bulanan per dimensi. Tiap deret diurutkan menurut periode. */
export function sanitizeQhsse(raw: unknown, errors: string[]) {
    if (isBlank(raw)) return {};
    if (!isObj(raw)) { errors.push('QHSSE format tidak valid'); return undefined; }
    const out: Record<string, unknown> = {};

    // NC (ringkasan bulanan)
    const nc = rows(raw.nc, 'NC', errors);
    if (nc) {
        const seen = new Set<string>();
        out.nc = nc.map((r, i) => {
            const L = `NC #${i + 1}`;
            const e: Record<string, unknown> = { periode: periodeOf(r, L, errors, seen) };
            for (const [k, label] of [['totalNC', 'total NC'], ['open', 'open'], ['closed', 'closed']] as const) {
                const v = num(r[k], `${L}: ${label}`, errors, { min: 0, int: true });
                if (v != null) e[k] = v;
            }
            const cost = num(r.totalCost, `${L}: cost of NC`, errors, { min: 0 });
            if (cost != null) e.totalCost = cost;
            if (typeof e.totalNC === 'number' && typeof e.open === 'number' && typeof e.closed === 'number'
                && e.open + e.closed > e.totalNC) errors.push(`${L}: open + closed melebihi total NC`);
            return e;
        }).sort((a, b) => String(a.periode).localeCompare(String(b.periode)));
    }

    // QPASS (per domain)
    const qp = rows(raw.qpass, 'QPASS', errors);
    if (qp) {
        const seen = new Set<string>();
        out.qpass = qp.map((r, i) => {
            const L = `QPASS #${i + 1}`;
            const e: Record<string, unknown> = { periode: periodeOf(r, L, errors, seen) };
            for (const k of ['struktur', 'arsitektur', 'mep', 'overall'] as const) {
                const v = num(r[k], `${L}: ${k}`, errors, { min: 0, max: 100 });
                if (v != null) e[k] = v;
            }
            return e;
        }).sort((a, b) => String(a.periode).localeCompare(String(b.periode)));
    }

    // Giat Bersih 5R: jumlah laporan (bulat) + rata-rata durasi (menit)
    const r5 = rows(raw.r5, '5R', errors);
    if (r5) {
        const seen = new Set<string>();
        out.r5 = r5.map((r, i) => {
            const L = `5R #${i + 1}`;
            const e: Record<string, unknown> = { periode: periodeOf(r, L, errors, seen) };
            const jumlah = num(r.jumlah, `${L}: jumlah laporan`, errors, { min: 0, int: true });
            if (jumlah != null) e.jumlah = jumlah;
            const durasi = num(r.durasi, `${L}: rata-rata durasi`, errors, { min: 0 });
            if (durasi != null) e.durasi = durasi;
            const c = str(r.catatan);
            tooLong(c, `${L}: catatan`, errors);
            if (c) e.catatan = c;
            return e;
        }).sort((a, b) => String(a.periode).localeCompare(String(b.periode)));
    }

    // Dimensi satu-nilai-per-bulan
    for (const d of QHSSE_NILAI) {
        const list = rows(raw[d.key], d.label, errors);
        if (!list) continue;
        const seen = new Set<string>();
        out[d.key] = list.map((r, i) => {
            const L = `${d.label} #${i + 1}`;
            const e: Record<string, unknown> = { periode: periodeOf(r, L, errors, seen) };

            if (d.key === 'trir') {
                // TRIR dihitung server-side dari elemen: (insiden × 200.000) ÷ jam kerja.
                const incidents = num(r.incidents, `${L}: insiden tercatat`, errors, { min: 0, int: true });
                const workHours = num(r.workHours, `${L}: total jam kerja`, errors, { min: 0 });
                if (incidents != null) e.incidents = incidents;
                if (workHours != null) e.workHours = workHours;
                if (typeof incidents === 'number' && typeof workHours === 'number' && workHours > 0) {
                    e.nilai = (incidents * 200_000) / workHours;
                }
            } else if (d.key === 'energi') {
                // Efisiensi Energi dihitung server-side: (kWh ÷ luas m²) × 100%.
                const energyKwh = num(r.energyKwh, `${L}: energi listrik (kWh)`, errors, { min: 0 });
                const areaM2 = num(r.areaM2, `${L}: luas bangunan (m²)`, errors, { min: 0 });
                if (energyKwh != null) e.energyKwh = energyKwh;
                if (areaM2 != null) e.areaM2 = areaM2;
                if (typeof energyKwh === 'number' && typeof areaM2 === 'number' && areaM2 > 0) {
                    e.nilai = (energyKwh / areaM2) * 100;
                }
            } else {
                const v = num(r.nilai, `${L}: nilai`, errors, { min: 0, max: d.max, int: d.int });
                if (v != null) e.nilai = v;
            }

            const c = str(r.catatan);
            tooLong(c, `${L}: catatan`, errors);
            if (c) e.catatan = c;
            return e;
        }).sort((a, b) => String(a.periode).localeCompare(String(b.periode)));
    }
    return out;
}

/**
 * Field pelengkap dashboard "model RRB" yang BELUM ada di data proyek biasa:
 * MC cair (+ label) dan keterangan cut-off. DIPA tersedia & sisa dimensi
 * dashboard diturunkan dari data existing (lihat src/lib/programDim.ts).
 */
export function sanitizeProgram(raw: unknown, errors: string[]) {
    if (isBlank(raw)) return {};
    if (!isObj(raw)) { errors.push('Data program format tidak valid'); return undefined; }
    const out: Record<string, unknown> = {};

    const mc = num(raw.mcCair, 'Program: MC cair', errors, { min: 0 });
    if (mc != null) out.mcCair = mc;
    const mcLabel = str(raw.mcCairLabel);
    tooLong(mcLabel, 'Program: keterangan MC cair', errors);
    if (mcLabel) out.mcCairLabel = mcLabel;
    const cut = str(raw.cutOffLabel);
    tooLong(cut, 'Program: keterangan cut-off', errors);
    if (cut) out.cutOffLabel = cut;

    return out;
}

export function sanitizeProgressKeuangan(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Progress keuangan', errors);
    if (!list) return undefined;
    const seen = new Set<number>();
    return list.map((r, i) => {
        const L = `Progress keuangan #${i + 1}`;
        const tahun = num(r.tahun, `${L}: tahun`, errors, { min: 2000, max: 2100, int: true });
        if (tahun === undefined) errors.push(`${L}: tahun wajib diisi (2000-2100)`);
        else if (seen.has(tahun)) errors.push(`${L}: tahun ${tahun} terisi dua kali`);
        else seen.add(tahun);
        const rencana = num(r.rencana, `${L}: pagu/rencana`, errors, { min: 0 }) ?? 0;
        const realisasi = num(r.realisasi, `${L}: realisasi`, errors, { min: 0 }) ?? 0;
        return { tahun: tahun ?? 0, rencana, realisasi };
    });
}

const BULAN_ID = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

export function sanitizeProgressMinggu(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Progress mingguan', errors);
    if (!list) return undefined;
    const seen = new Set<string>();
    return list.map((r, i) => {
        const L = `Progress mingguan #${i + 1}`;
        const bulan = str(r.bulan);
        if (!bulan) errors.push(`${L}: bulan wajib diisi`);
        else if (!BULAN_ID.some((b) => bulan.toLowerCase().includes(b))) errors.push(`${L}: nama bulan tidak dikenali`);
        const tahun = num(r.tahun, `${L}: tahun`, errors, { min: 2000, max: 2100, int: true });
        if (tahun === undefined) errors.push(`${L}: tahun wajib diisi`);
        const key = `${bulan.toLowerCase()}|${tahun}`;
        if (seen.has(key)) errors.push(`${L}: bulan ${bulan} ${tahun} terisi dua kali`);
        seen.add(key);
        const out: Record<string, unknown> = { bulan, tahun: tahun ?? 0 };
        for (let w = 1; w <= 4; w++) {
            for (const t of ['Ra', 'Ri'] as const) {
                out[`w${w}${t}`] = num(r[`w${w}${t}`], `${L}: W${w} ${t.toUpperCase()}`, errors, { min: 0, max: 100 }) ?? 0;
            }
        }
        return out;
    });
}

const CM_JENIS = ['PERUBAHAN_HARGA', 'PERUBAHAN_LINGKUP', 'KLAIM', 'LEGAL_ISSUE', 'LAINNYA'];
const CM_STATUS = ['USULAN', 'DISETUJUI', 'DITOLAK'];

export function sanitizeChangeManagement(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Change management', errors);
    if (!list) return undefined;
    return list.map((r, i) => {
        const L = `Change management #${i + 1}`;
        const judul = str(r.judul);
        if (!judul) errors.push(`${L}: judul wajib diisi`);
        tooLong(judul, `${L}: judul`, errors);
        const out: Record<string, unknown> = { judul };
        const jenis = isBlank(r.jenis) ? 'LAINNYA' : String(r.jenis);
        if (!CM_JENIS.includes(jenis)) errors.push(`${L}: jenis tidak valid`);
        out.jenis = jenis;
        const status = isBlank(r.status) ? 'USULAN' : String(r.status);
        if (!CM_STATUS.includes(status)) errors.push(`${L}: status tidak valid`);
        out.status = status;
        for (const k of ['deskripsi', 'dampak', 'mitigasi', 'target', 'pic'] as const) {
            const v = str(r[k]);
            tooLong(v, `${L}: ${k}`, errors);
            if (v) out[k] = v;
        }
        // Nilai perubahan boleh negatif (pengurangan nilai kontrak).
        const nilai = num(r.nilai, `${L}: nilai`, errors);
        if (nilai !== undefined) out.nilai = nilai;
        const tanggal = dateOrUndef(r.tanggal, `${L}: tanggal`, errors);
        if (tanggal) out.tanggal = tanggal;
        return out;
    });
}

export function sanitizeLingkup(raw: unknown, errors: string[]) {
    if (isBlank(raw)) return [];
    if (!Array.isArray(raw)) { errors.push('Lingkup pekerjaan harus berupa daftar'); return undefined; }
    if (raw.length > MAX_ROWS) { errors.push(`Lingkup pekerjaan terlalu banyak (maks ${MAX_ROWS} baris)`); return undefined; }
    const out: string[] = [];
    raw.forEach((v, i) => {
        const s = str(v);
        if (tooLong(s, `Lingkup pekerjaan #${i + 1}`, errors)) return;
        if (s) out.push(s); // baris kosong dibuang (bukan galat)
    });
    return out;
}

export function sanitizeMonitoringPengadaan(raw: unknown, errors: string[]) {
    const list = rows(raw, 'Monitoring pengadaan', errors);
    if (!list) return undefined;
    return list.map((r, i) => {
        const L = `Monitoring pengadaan #${i + 1}`;
        const nama = str(r.nama);
        if (!nama) errors.push(`${L}: nama item wajib diisi`);
        tooLong(nama, `${L}: nama`, errors);
        const persentase = num(r.persentase, `${L}: persentase`, errors, { min: 0, max: 100 }) ?? 0;
        return { nama, persentase: Math.round(persentase * 100) / 100 };
    });
}
