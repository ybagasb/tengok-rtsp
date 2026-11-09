/**
 * Registry dashboard "model RRB" per-kategori — MURNI (tanpa mongoose/React).
 *
 * Dashboard menampilkan dimensi data bergaya RRB (progress fisik, keuangan,
 * profitabilitas BL/BAU/L-R) untuk sekumpulan proyek (Location). SEMUA data
 * ditarik dari data proyek yang SUDAH ADA (progress fisik, kontrak, laporan
 * bulanan) ditambah sedikit field pelengkap (DIPA, MC cair, cut-off, BL) yang
 * diisi PIC lewat Detail Proyek di sidebar peta biasa. Tidak ada peta/koleksi
 * khusus — proyek tetap Location di divisinya masing-masing.
 *
 * Menambah dashboard untuk kategori lain = cukup menambah satu entri di bawah.
 */

import type { DivisionKey } from '@/lib/divisionTheme';

export interface CategoryDashboardSection {
    /** Label section (nama divisi atau nama kategori). */
    label: string;
    /** Filter Location: divisi (opsional) + kategori (opsional, Category.identifier). */
    division?: DivisionKey;
    category?: string;
}

export interface CategoryDashboardConfig {
    /** id dashboard dipakai di URL: /category-dashboard/<id>. */
    id: string;
    /** Judul tampil di dashboard & tombol. */
    label: string;
    /** Deskripsi singkat untuk subjudul dashboard. */
    description?: string;
    /** Divisi untuk tema warna dashboard & tautan "Kembali". */
    themeDivision: DivisionKey;
    /** Tujuan tombol "Kembali" (mis. kembali ke kartu RRB). */
    backHref: string;
    /** Category.identifier yang memunculkan tombol dashboard ini di panel kategori. */
    triggerCategories: string[];
    /** Section-section yang ditampilkan dashboard (tiap section = satu tabel). */
    sections: CategoryDashboardSection[];
}

export const CATEGORY_DASHBOARDS: CategoryDashboardConfig[] = [
    // RRB — proyek kategori "bencana" di tiap divisi (dikelompokkan per divisi).
    {
        id: 'rrb',
        label: 'Rehab, Rekon & Bencana',
        description: 'Rekap proyek penanganan bencana (kategori Bencana) per divisi',
        themeDivision: 'DIVISI 2',
        backHref: '/categories?div=REHAB',
        // Kosong: kategori Bencana TIDAK menampilkan tombol dashboard di baris kategori.
        // Dashboard RRB diakses dari tombol Dashboard di menu RRB (kartu REHAB).
        // Datanya tetap ditarik dari proyek kategori 'bencana' via `sections`.
        triggerCategories: [],
        sections: [
            { label: 'Divisi 1', division: 'DIVISI 1', category: 'bencana' },
            { label: 'Divisi 2', division: 'DIVISI 2', category: 'bencana' },
            { label: 'Divisi 3', division: 'DIVISI 3', category: 'bencana' },
        ],
    },
    // PL Irigasi & JIAT — untuk sekarang hanya kategori JIAT (Divisi 2).
    // Kategori Irigasi dikeluarkan dulu; tambahkan lagi di `sections` + `triggerCategories` bila diperlukan.
    {
        id: 'irigasi-jiat',
        label: 'PL Irigasi & JIAT',
        description: 'Rekap dimensi data program (fisik, keuangan, profitabilitas) proyek Irigasi & JIAT',
        themeDivision: 'DIVISI 2',
        backHref: '/categories?div=DIVISI%202',
        triggerCategories: ['jiat'],
        sections: [
            { label: 'JIAT', division: 'DIVISI 2', category: 'jiat' },
        ],
    },
];

/** Cari konfigurasi dashboard menurut id (dipakai halaman /category-dashboard/[id]). */
export function dashboardById(id: string): CategoryDashboardConfig | undefined {
    return CATEGORY_DASHBOARDS.find((d) => d.id === id);
}

/**
 * Cari dashboard yang dipicu oleh sebuah Category.identifier (dipakai panel
 * kategori untuk memunculkan tombol Dashboard di samping tombol Masuk).
 */
export function dashboardForCategory(identifier: string): CategoryDashboardConfig | undefined {
    return CATEGORY_DASHBOARDS.find((d) => d.triggerCategories.includes(identifier));
}
