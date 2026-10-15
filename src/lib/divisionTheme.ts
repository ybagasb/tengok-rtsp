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

/**
 * Konversi warna hex (#rrggbb atau #rgb) ke triplet string "r, g, b"
 * untuk digunakan dalam ekspresi rgba(var(--div-accent-rgb), <opacity>).
 */
export function hexToRgb(hex: string): string {
    const cleanHex = hex.replace('#', '').trim();
    const fullHex = cleanHex.length === 3
        ? cleanHex.split('').map(c => c + c).join('')
        : cleanHex;
    const num = parseInt(fullHex, 16);
    if (isNaN(num) || fullHex.length !== 6) {
        return '234, 179, 8'; // Fallback brand yellow (rgb)
    }
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r}, ${g}, ${b}`;
}

export const BRAND_THEME = {
    accentHex: '#eab308',
    accentRgb: '234, 179, 8',
    glow: 'rgba(234, 179, 8, 0.45)',
} as const;

export function getDivisionCssVars(div?: string | null): Record<string, string> {
    const theme = getDivisionTheme(div);
    if (!theme) {
        return {
            '--div-accent': BRAND_THEME.accentHex,
            '--div-accent-rgb': BRAND_THEME.accentRgb,
            '--div-glow': BRAND_THEME.glow,
        };
    }
    return {
        '--div-accent': theme.accentHex,
        '--div-accent-rgb': hexToRgb(theme.accentHex),
        '--div-glow': theme.glow,
    };
}
