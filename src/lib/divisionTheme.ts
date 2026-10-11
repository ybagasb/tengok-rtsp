/**
 * divisionTheme.ts — sumber tunggal identitas visual + penjelasan tiap Divisi.
 * Dipakai di halaman kategori per-divisi, hero 3D, kartu, dan aksen warna.
 */

export type DivisionKey = 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';

// Kunci model 3D (porting dari generator prosedural).
export type DivisionModelKey = 'gedung' | 'bendungan' | 'tol';

export interface DivisionTheme {
    key: DivisionKey;
    short: string;            // "Divisi 1"
    title: string;            // judul lengkap
    tagline: string;          // satu kalimat fokus
    description: string;      // penjelasan lebih panjang
    model: DivisionModelKey;  // objek 3D khas
    // Kelas Tailwind aksen (gradient) + warna hex untuk 3D/aksen non-Tailwind.
    gradient: string;         // "from-... to-..."
    accentHex: string;        // warna aksen utama (hex)
    glow: string;             // rgba untuk glow
    chipClass: string;        // badge kecil
}

export const DIVISION_THEME: Record<DivisionKey, DivisionTheme> = {
    'DIVISI 1': {
        key: 'DIVISI 1',
        short: 'Divisi 1',
        title: 'Gedung & Bangunan',
        tagline: 'Gedung, bangunan & fasilitas publik',
        description:
            'Membangun gedung pemerintahan, rumah sakit, sekolah, hunian vertikal, bandara, dan fasilitas publik di berbagai wilayah Indonesia maupun luar negeri.',
        model: 'gedung',
        gradient: 'from-indigo-500 to-blue-500',
        accentHex: '#3b82f6',
        glow: 'rgba(59,130,246,0.45)',
        chipClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    },
    'DIVISI 2': {
        key: 'DIVISI 2',
        short: 'Divisi 2',
        title: 'Sumber Daya Air',
        tagline: 'Bendungan, air & sumber daya air',
        description:
            'Membangun bendungan, embung, jaringan irigasi, pengendalian banjir, PLTM, serta infrastruktur sumber daya air untuk mendukung ketahanan air dan pangan.',
        model: 'bendungan',
        gradient: 'from-cyan-500 to-teal-500',
        accentHex: '#14b8a6',
        glow: 'rgba(20,184,166,0.45)',
        chipClass: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    },
    'DIVISI 3': {
        key: 'DIVISI 3',
        short: 'Divisi 3',
        title: 'Jalan, Tol & Infrastruktur',
        tagline: 'Jalan, tol & infrastruktur transportasi',
        description:
            'Membangun jalan tol, jembatan, Bus Rapid Transit (BRT), serta jaringan perpipaan air dan gas untuk konektivitas dan infrastruktur transportasi nasional.',
        model: 'tol',
        gradient: 'from-amber-500 to-orange-500',
        accentHex: '#f59e0b',
        glow: 'rgba(245,158,11,0.45)',
        chipClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    },
};

export function getDivisionTheme(div?: string | null): DivisionTheme | null {
    if (!div) return null;
    return DIVISION_THEME[div as DivisionKey] ?? null;
}
