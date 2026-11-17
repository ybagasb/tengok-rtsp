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
    /**
     * true = baris kategori dashboard ini di-pin ke atas panel kategori (urutan = urutan entri).
     * Dashboard lain tidak di-pin: barisnya tetap urut jumlah proyek terbanyak.
     */
    pinned?: boolean;
}

/** Dashboard standar untuk satu kategori di satu divisi (satu tabel, dipicu dari baris kategorinya). */
function categoryDashboard(id: string, label: string, division: DivisionKey, category: string): CategoryDashboardConfig {
    return {
        id,
        label,
        description: `Rekap dimensi data program (fisik, keuangan, profitabilitas) proyek ${label}`,
        themeDivision: division,
        backHref: `/categories?div=${encodeURIComponent(division)}`,
        triggerCategories: [category],
        sections: [{ label, division, category }],
    };
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
    // PL Irigasi & JIAT — kategori Irigasi PL (PL INPRES I 2026) dan JIAT di Divisi 2.
    // Kategori Irigasi (Non Inpres) sengaja tidak ikut.
    {
        id: 'irigasi-jiat',
        label: 'PL Irigasi & JIAT',
        description: 'Rekap dimensi data program (fisik, keuangan, profitabilitas) proyek Irigasi & JIAT',
        themeDivision: 'DIVISI 2',
        backHref: '/categories?div=DIVISI%202',
        triggerCategories: ['jiat'],
        pinned: true,
        sections: [
            { label: 'Irigasi PL', division: 'DIVISI 2', category: 'irigasi-pl' },
            { label: 'JIAT', division: 'DIVISI 2', category: 'jiat' },
        ],
    },
    // Irigasi PL (PL INPRES I 2026) — dashboard sendiri, hanya kategori Irigasi PL.
    {
        id: 'irigasi-pl',
        label: 'Irigasi PL',
        description: 'Rekap dimensi data program (fisik, keuangan, profitabilitas) proyek Irigasi PL (PL INPRES I 2026)',
        themeDivision: 'DIVISI 2',
        backHref: '/categories?div=DIVISI%202',
        triggerCategories: ['irigasi-pl'],
        pinned: true,
        sections: [
            { label: 'Irigasi PL', division: 'DIVISI 2', category: 'irigasi-pl' },
        ],
    },
    // ── Dashboard per kategori (satu kategori = satu dashboard, satu tabel) ──────────────────
    // Kategori Bencana sengaja tidak ada di sini: sudah punya dashboard RRB lintas divisi.
    // DIVISI 1
    // Grup Sekolah (baris induk di panel) = Sekolah Rakyat + Sekolah; id baris induk = 'grup-sekolah'.
    {
        id: 'sekolah',
        label: 'Sekolah',
        description: 'Rekap dimensi data program proyek Sekolah Rakyat dan Sekolah',
        themeDivision: 'DIVISI 1',
        backHref: '/categories?div=DIVISI%201',
        triggerCategories: ['grup-sekolah'],
        sections: [
            { label: 'Sekolah Rakyat', division: 'DIVISI 1', category: 'sekolah-rakyat' },
            { label: 'Sekolah', division: 'DIVISI 1', category: 'sekolah' },
        ],
    },
    categoryDashboard('sekolah-rakyat', 'Sekolah Rakyat', 'DIVISI 1', 'sekolah-rakyat'),
    categoryDashboard('sekolah-umum', 'Sekolah', 'DIVISI 1', 'sekolah'),
    categoryDashboard('rumah-sakit', 'Rumah Sakit', 'DIVISI 1', 'rumah-sakit'),
    categoryDashboard('perkantoran', 'Perkantoran', 'DIVISI 1', 'perkantoran'),
    categoryDashboard('rusun', 'Rusun', 'DIVISI 1', 'rusun'),
    categoryDashboard('gor', 'Gedung Olahraga', 'DIVISI 1', 'gor'),
    categoryDashboard('bandara', 'Bandara', 'DIVISI 1', 'bandara'),
    categoryDashboard('rumah-ibadah', 'Rumah Ibadah', 'DIVISI 1', 'rumah-ibadah'),
    categoryDashboard('perumahan', 'Perumahan', 'DIVISI 1', 'perumahan'),
    // DIVISI 2 (Irigasi PL dan PL Irigasi & JIAT ada di atas)
    categoryDashboard('bendungan', 'Bendungan', 'DIVISI 2', 'bendungan'),
    categoryDashboard('sungai-pantai', 'Sungai Pantai', 'DIVISI 2', 'sungai-pantai'),
    categoryDashboard('lainnya', 'Lainnya', 'DIVISI 2', 'lainnya'),
    categoryDashboard('irigasi', 'Irigasi', 'DIVISI 2', 'irigasi'),
    categoryDashboard('embung', 'Embung', 'DIVISI 2', 'embung'),
    categoryDashboard('pltm', 'PLTM', 'DIVISI 2', 'pltm'),
    // DIVISI 3
    categoryDashboard('jalan-tol', 'Jalan Tol', 'DIVISI 3', 'jalan-tol'),
    categoryDashboard('sewerage', 'Sewerage', 'DIVISI 3', 'sewerage'),
    categoryDashboard('brt', 'BRT', 'DIVISI 3', 'brt'),
    categoryDashboard('pipa-gas', 'Pipa Gas', 'DIVISI 3', 'pipa-gas'),
    categoryDashboard('pipa-air', 'Pipa Air', 'DIVISI 3', 'pipa-air'),
    categoryDashboard('jembatan', 'Jembatan', 'DIVISI 3', 'jembatan'),
];

/** Cari konfigurasi dashboard menurut id (dipakai halaman /category-dashboard/[id]). */
export function dashboardById(id: string): CategoryDashboardConfig | undefined {
    return CATEGORY_DASHBOARDS.find((d) => d.id === id);
}

/**
 * Cari dashboard yang dipicu oleh sebuah Category.identifier (dipakai panel
 * kategori untuk memunculkan tombol Dashboard di samping tombol Masuk).
 */
/**
 * Urutan pin di panel kategori = urutan entri ber-`pinned` di CATEGORY_DASHBOARDS.
 * Kategori yang tidak di-pin mengembalikan Infinity (urut jumlah proyek).
 */
export function dashboardPinRank(identifier: string): number {
    const i = CATEGORY_DASHBOARDS.findIndex((d) => d.pinned && d.triggerCategories.includes(identifier));
    return i < 0 ? Infinity : i;
}

export function dashboardForCategory(identifier: string): CategoryDashboardConfig | undefined {
    return CATEGORY_DASHBOARDS.find((d) => d.triggerCategories.includes(identifier));
}
