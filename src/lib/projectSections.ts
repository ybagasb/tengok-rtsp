/**
 * Dimensi data detail proyek + penanda "terakhir diperbarui" per dimensi.
 * File MURNI (tanpa mongoose) supaya aman dipakai API dan klien.
 * Disimpan di Location.sectionUpdates[<section>] = { at, by }.
 */
export type ProjectSection =
    | 'info' | 'contract' | 'progress' | 'ikhtiar' | 'finansial' | 'kinerja' | 'mingguan'
    | 'milestone' | 'sumberDaya' | 'monitoring' | 'isu' | 'kendala' | 'changeMgmt'
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
    isuStrategis: 'isu', kendala: 'kendala', changeManagement: 'changeMgmt',
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

/** "30 Okt 2026, 14.20" atau undefined bila tak valid. */
export function formatStampTime(at?: string | Date): string | undefined {
    if (!at) return undefined;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
