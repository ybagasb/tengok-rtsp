/**
 * Sinkronisasi field "lama" proyek dari Laporan Bulanan terbaru (SERVER ONLY).
 * Lihat derivedFromLaporan di projectReport.ts untuk daftar field turunan.
 */
import Location from '@/models/Location';
import { derivedFromLaporan, type DeriveSource } from '@/lib/projectReport';

/** Bagian dokumen yang dibaca untuk menurunkan field (plus kas untuk saldoKas). */
export const DERIVE_SELECT = 'laporanBulanan bk cashInAwal cashOutAwal';

export async function loadDeriveSource(id: string): Promise<DeriveSource | null> {
    return Location.findById(id).select(DERIVE_SELECT).lean<DeriveSource>();
}

/**
 * Tulis field turunan ke dokumen proyek. Best-effort: kegagalan hanya dicatat,
 * tidak menggagalkan penyimpanan laporan.
 *
 * saldoKas ikut diperbarui HANYA bila nilainya sebelumnya otomatis (kosong atau
 * sama dengan cashIn − cashOut); override manual PIC dibiarkan.
 */
export async function syncLegacy(id: string): Promise<void> {
    try {
        const doc = await Location.findById(id)
            .select(`${DERIVE_SELECT} cashIn cashOut saldoKas`)
            .lean<DeriveSource & { cashIn?: number; cashOut?: number; saldoKas?: number }>();
        if (!doc) return;
        const derived = derivedFromLaporan(doc);
        if (Object.keys(derived).length === 0) return;

        const set: Record<string, unknown> = { ...derived };
        if (derived.cashIn !== undefined || derived.cashOut !== undefined) {
            const wasAuto = doc.saldoKas == null || doc.saldoKas === (doc.cashIn ?? 0) - (doc.cashOut ?? 0);
            if (wasAuto) set.saldoKas = (derived.cashIn ?? doc.cashIn ?? 0) - (derived.cashOut ?? doc.cashOut ?? 0);
        }
        await Location.updateOne({ _id: id }, { $set: set });
    } catch (e) {
        console.warn('[Laporan] sinkronisasi field lama gagal:', (e as { message?: string })?.message);
    }
}
