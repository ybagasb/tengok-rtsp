/**
 * Dimensi data detail proyek + penanda "terakhir diperbarui" per dimensi.
 * File MURNI (tanpa mongoose) supaya aman dipakai API dan klien.
 * Disimpan di Location.sectionUpdates[<section>] = { at, by }.
 */
export type ProjectSection =
    | 'info' | 'contract' | 'progress' | 'ikhtiar' | 'finansial' | 'kinerja' | 'mingguan'
    | 'milestone' | 'sumberDaya' | 'monitoring' | 'qhsse' | 'changeMgmt'
    | 'program'
    | 'location' | 'gallery' | 'documents' | 'laporan';

export interface SectionStamp { at: string; by?: string }
export type SectionUpdates = Partial<Record<ProjectSection, SectionStamp>>;

/** Field dokumen yang diubah lewat PATCH → dimensi data yang dicatat. */
const FIELD_SECTION: Record<string, ProjectSection> = {
    name: 'info', description: 'info', status: 'info', contractor: 'info', startDate: 'info', endDate: 'info',
    pmName: 'info', pmPhone: 'info', penggunaJasa: 'info', pengawas: 'info', penyediaJasa: 'info',
    division: 'info', projectType: 'info',
    contractNumber: 'contract', contractValue: 'contract',
    progressPercent: 'progress', progressRencana: 'progress', progressDeviasi: 'progress',
    progressPeriode: 'progress', lingkupPekerjaan: 'progress',
    cpi: 'ikhtiar', spi: 'ikhtiar',
    tagihanBruto: 'finansial', cashIn: 'finansial', cashOut: 'finansial', saldoKas: 'finansial',
    saldoHutang: 'finansial', bad: 'finansial', piutang: 'finansial', ccc: 'finansial',
    bebanKonstruksi: 'finansial', hasilUsaha: 'finansial', progressKeuangan: 'finansial',
    tagihanBelumDiproses: 'finansial',
    pu: 'kinerja', bk: 'kinerja', lk: 'kinerja',
    progressMinggu: 'mingguan',
    milestones: 'milestone', sumberDaya: 'sumberDaya', monitoringPengadaan: 'monitoring',
    qhsse: 'qhsse', changeManagement: 'changeMgmt', program: 'program',
    footprint: 'location', footprintHeight: 'location',
};

export function sectionsForFields(fields: string[]): ProjectSection[] {
    const out = new Set<ProjectSection>();
    for (const f of fields) {
        const s = FIELD_SECTION[f];
        if (s) out.add(s);
    }
    return [...out];
}

/** Bentuk $set untuk mencatat waktu & pelaku pada tiap dimensi. */
export function stampSet(sections: ProjectSection[], by?: string, at: Date = new Date()): Record<string, { at: Date; by?: string }> {
    const out: Record<string, { at: Date; by?: string }> = {};
    for (const s of sections) out[`sectionUpdates.${s}`] = { at, ...(by ? { by } : {}) };
    return out;
}

/**
 * Ekstrak nama ringkas pelaku pembaruan dari string audit.
 * Contoh:
 *   "hendra_irawan <hendra_irawan@unknown.com> (sub:0fc6cf1d..., ip:127.0.0.1)" -> "hendra_irawan"
 *   "Admin (PIN) (ip:127.0.0.1)" -> "Admin (PIN)"
 *   "admin (ip:127.0.0.1)" -> "Admin"
 *   "budi@perusahaan.com (sub:123)" -> "budi@perusahaan.com"
 */
export function formatStampActor(by?: string): string | undefined {
    if (!by) return undefined;
    const trimmed = by.trim();
    if (!trimmed) return undefined;

    // 1. Format "Nama <email> ..." -> ambil Nama
    const emailMatch = trimmed.match(/^([^<]+)<[^>]+>/);
    if (emailMatch && emailMatch[1].trim()) {
        const name = emailMatch[1].trim();
        return name.toLowerCase() === 'admin' ? 'Admin' : name;
    }

    // 2. Buang metadata di akhir seperti "(sub:..., ip:...)" atau "(ip:...)"
    const withoutMeta = trimmed.replace(/\s*\((?:sub:[^)]+|ip:[^)]+)\)/gi, '').trim();
    if (!withoutMeta) return trimmed;
    return withoutMeta.toLowerCase() === 'admin' ? 'Admin' : withoutMeta;
}

/** "17 Nov, 14.20" bila tahun ini, atau "17 Nov 2025, 14.20" bila tahun berbeda. */
export function formatStampTime(at?: string | Date, options?: { showYear?: boolean }): string | undefined {
    if (!at) return undefined;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return undefined;

    const now = new Date();
    const isCurrentYear = d.getFullYear() === now.getFullYear();
    if (!options?.showYear && isCurrentYear) {
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
        return `${dateStr}, ${timeStr}`;
    }
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).replace(':', '.');
}
