/**
 * Pembuat PDF "Update Pengisian Proyek" per divisi (dipakai di /admin/pengisian).
 * Dijalankan di browser; jspdf di-import dinamis supaya tidak membebani bundel awal.
 *
 * Isi PDF:
 *   1. Ringkasan per proyek: nama singkat + nama lengkap, terisi n/18, dan dimensi
 *      yang belum diisi (paling sedikit terisi di atas).
 *   2. Matriks per dimensi (centang/silang). Nomor & urutan sama dengan tabel 1.
 */
import type { jsPDF } from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import {
    TOTAL_DIMENSI, dimensiBelumDiisi, formatWaktuWib, persen, ringkas, stempelFile, urutkanKurangTerisi,
    type BarisPengisian,
} from '@/lib/pengisian';

type Rgb = [number, number, number];
const NAVY: Rgb = [31, 58, 95];
const OK_FILL: Rgb = [217, 242, 217];
const NO_FILL: Rgb = [248, 215, 218];
const GRID: Rgb = [191, 191, 191];
const MUTED: Rgb = [89, 89, 89];
const OK_INK: Rgb = [21, 128, 61];
const NO_INK: Rgb = [185, 28, 28];

const MARGIN = 10;

export interface OpsiPdfPengisian {
    /** Mis. "DIVISI 2". */
    divisi: string;
    baris: BarisPengisian[];
    /** Label dimensi, sejajar dengan BarisPengisian.checks. */
    dimensi: string[];
    /** ISO time saat data diambil dari server. */
    generatedAt: string;
}

// Font bawaan PDF (WinAnsi) tidak bisa menampilkan karakter di luar Latin-1 + tanda baca
// tipografis umum; ganti dengan "?" supaya tidak jadi karakter rusak.
const WIN_ANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
function aman(s: string): string {
    return Array.from(s)
        .map(ch => (ch.charCodeAt(0) <= 255 || WIN_ANSI_EXTRA.has(ch) ? ch : '?'))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

function labelDivisi(divisi: string): string {
    return divisi.charAt(0).toUpperCase() + divisi.slice(1).toLowerCase(); // "DIVISI 2" -> "Divisi 2"
}

export function namaFilePdf(divisi: string, generatedAt: string): string {
    return `Update-Pengisian-Proyek-${labelDivisi(divisi).replace(/\s+/g, '-')}-${stempelFile(generatedAt)}.pdf`;
}

export async function buatPdfPengisian(opsi: OpsiPdfPengisian): Promise<jsPDF> {
    const [{ jsPDF: JsPdf }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);

    const { divisi, dimensi, generatedAt } = opsi;
    const label = labelDivisi(divisi);
    const waktu = formatWaktuWib(generatedAt);
    const urut = urutkanKurangTerisi(opsi.baris);
    const rk = ringkas(urut);

    const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const contentW = pageW - MARGIN * 2;

    // ── Judul + ringkasan ────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0, 0, 0);
    doc.text(`Update Pengisian Proyek ${label}`, MARGIN, 14);

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    const ringkasan =
        `Per ${waktu}   |   Total proyek: ${rk.total}   |   Proyek lengkap (${TOTAL_DIMENSI}/${TOTAL_DIMENSI}): ${rk.lengkap}   |   ` +
        `Belum ada dimensi terisi: ${rk.belumMulai}   |   Rata-rata pengisian: ${rk.rata}%   |   ` +
        `Dimensi kosong: ${rk.dimensiKosong} dari ${rk.dimensiTotal}`;
    const ringkasanLines = doc.splitTextToSize(ringkasan, contentW) as string[];
    doc.text(ringkasanLines, MARGIN, 20);
    let y = 20 + ringkasanLines.length * 3.6 + 3;

    if (urut.length === 0) {
        doc.setFontSize(10).setTextColor(0, 0, 0);
        doc.text(`Belum ada proyek di ${label}.`, MARGIN, y + 6);
        tambahFooter(doc, label, waktu, pageW, pageH);
        return doc;
    }

    // ── Tabel 1: ringkasan per proyek ────────────────────────────────────────
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 0, 0);
    doc.text('1. Ringkasan per proyek (diurutkan dari yang paling sedikit terisi)', MARGIN, y);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text('Nama lengkap diambil dari deskripsi proyek; tanda "-" berarti belum diisi.', MARGIN, y + 4);
    y += 7;

    autoTable(doc, {
        startY: y,
        margin: { top: 14, right: MARGIN, bottom: 14, left: MARGIN },
        theme: 'grid',
        head: [['No', 'Nama Proyek (singkat)', 'Nama Lengkap', 'Kategori', 'Status', 'Terisi', '%', 'Belum Diisi']],
        body: urut.map((b, i) => [
            String(i + 1),
            aman(b.name),
            b.fullName ? aman(b.fullName) : '-',
            aman(b.category),
            aman(b.status),
            `${b.terisi}/${TOTAL_DIMENSI}`,
            `${persen(b)}%`,
            dimensiBelumDiisi(b).length ? dimensiBelumDiisi(b).join(', ') : 'Lengkap',
        ]),
        styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.2, lineColor: GRID, lineWidth: 0.1, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 46, fontStyle: 'bold' },
            2: { cellWidth: 76 },
            3: { cellWidth: 20, halign: 'center' },
            4: { cellWidth: 15, halign: 'center' },
            5: { cellWidth: 14, halign: 'center' },
            6: { cellWidth: 11, halign: 'center' },
            7: { cellWidth: 'auto' },
        },
        didParseCell: (data: CellHookData) => {
            if (data.section === 'head' && (data.column.index === 1 || data.column.index === 2 || data.column.index === 7)) {
                data.cell.styles.halign = 'left';
            }
            if (data.section === 'body' && data.column.index === 6) {
                const b = urut[data.row.index];
                if (b.terisi === TOTAL_DIMENSI) data.cell.styles.fillColor = OK_FILL;
                else if (b.terisi / TOTAL_DIMENSI < 0.5) data.cell.styles.fillColor = NO_FILL;
            }
        },
    });

    // ── Tabel 2: matriks per dimensi ─────────────────────────────────────────
    doc.addPage();
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 0, 0);
    doc.text('2. Detail per dimensi', MARGIN, 14);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text('Centang hijau = sudah diisi, silang merah = belum diisi. Nomor dan urutan sama dengan tabel 1 (nama lengkap ada di tabel 1).', MARGIN, 18);

    const noW = 8;
    const nameW = 56;
    const dimW = (contentW - noW - nameW) / dimensi.length;
    const columnStyles: Record<number, { cellWidth: number; halign?: 'center' | 'left'; fontStyle?: 'bold' }> = {
        0: { cellWidth: noW, halign: 'center' },
        1: { cellWidth: nameW, fontStyle: 'bold' },
    };
    dimensi.forEach((_, i) => { columnStyles[i + 2] = { cellWidth: dimW, halign: 'center' }; });

    autoTable(doc, {
        startY: 21,
        margin: { top: 14, right: MARGIN, bottom: 14, left: MARGIN },
        theme: 'grid',
        head: [['No', 'Nama Proyek', ...dimensi]],
        body: urut.map((b, i) => [String(i + 1), aman(b.name), ...dimensi.map(() => '')]),
        styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.2, lineColor: GRID, lineWidth: 0.1, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 5.5, cellPadding: 0.8 },
        columnStyles,
        didParseCell: (data: CellHookData) => {
            if (data.section === 'head' && data.column.index === 1) data.cell.styles.halign = 'left';
            if (data.section === 'body' && data.column.index >= 2) {
                data.cell.styles.fillColor = urut[data.row.index].checks[data.column.index - 2] ? OK_FILL : NO_FILL;
            }
        },
        // Font bawaan tidak punya glyph centang/silang → gambar sebagai garis vektor.
        didDrawCell: (data: CellHookData) => {
            if (data.section !== 'body' || data.column.index < 2) return;
            const ok = urut[data.row.index].checks[data.column.index - 2];
            const cx = data.cell.x + data.cell.width / 2;
            const cy = data.cell.y + data.cell.height / 2;
            const d = data.doc as jsPDF;
            d.setLineWidth(0.45).setLineCap('round').setLineJoin('round');
            if (ok) {
                d.setDrawColor(...OK_INK);
                d.line(cx - 1.4, cy + 0.1, cx - 0.4, cy + 1.1);
                d.line(cx - 0.4, cy + 1.1, cx + 1.5, cy - 1.2);
            } else {
                d.setDrawColor(...NO_INK);
                d.line(cx - 1.1, cy - 1.1, cx + 1.1, cy + 1.1);
                d.line(cx + 1.1, cy - 1.1, cx - 1.1, cy + 1.1);
            }
        },
    });

    tambahFooter(doc, label, waktu, pageW, pageH);
    return doc;
}

function tambahFooter(doc: jsPDF, label: string, waktu: string, pageW: number, pageH: number) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
        doc.text(`Tengok  |  Update Pengisian Proyek ${label}  |  ${waktu}`, MARGIN, pageH - 6);
        doc.text(`Halaman ${i} dari ${total}`, pageW - MARGIN, pageH - 6, { align: 'right' });
    }
}

/** Buat PDF lalu langsung diunduh browser. */
export async function unduhPdfPengisian(opsi: OpsiPdfPengisian): Promise<void> {
    const doc = await buatPdfPengisian(opsi);
    doc.save(namaFilePdf(opsi.divisi, opsi.generatedAt));
}
