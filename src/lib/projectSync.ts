/**
 * Sinkronisasi field "lama" proyek dari Laporan Bulanan terbaru (SERVER ONLY).
 * Lihat derivedFromLaporan di projectReport.ts untuk daftar field turunan.
 */
import Location from '@/models/Location';
import { derivedFromLaporan, type DeriveSource } from '@/lib/projectReport';

/** Bagian dokumen yang dibaca untuk menurunkan field. */
export const DERIVE_SELECT = 'laporanBulanan bk cashInAwal cashOutAwal';

export async function loadDeriveSource(id: string): Promise<DeriveSource | null> {
    return Location.findById(id).select(DERIVE_SELECT).lean<DeriveSource>();
}

/**
 * Tulis field turunan ke dokumen proyek. Best-effort: kegagalan hanya dicatat,
 * tidak menggagalkan penyimpanan laporan.
 *
 * saldoKas TIDAK pernah disentuh di sini: Saldo Kas (Cash Balance) selalu diisi
 * manual oleh PIC di tab Finansial.
 */
export async function syncLegacy(id: string): Promise<void> {
    try {
        const doc = await Location.findById(id).select(DERIVE_SELECT).lean<DeriveSource>();
        if (!doc) return;
        const derived = derivedFromLaporan(doc);
        if (Object.keys(derived).length === 0) return;

        await Location.updateOne({ _id: id }, { $set: { ...derived } });
    } catch (e) {
        console.warn('[Laporan] sinkronisasi field lama gagal:', (e as { message?: string })?.message);
    }
}
