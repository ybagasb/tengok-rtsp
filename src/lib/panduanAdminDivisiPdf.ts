/**
 * Generator PDF "Panduan Operasional Admin Divisi" untuk aplikasi TENGOK.
 * Dijalankan di browser (dynamic import jsPDF + jspdf-autotable) agar PDF
 * otomatis disesuaikan untuk Divisi 1, Divisi 2, atau Divisi 3.
 */
import type { jsPDF } from 'jspdf';
import { DIVISION_THEME, type DivisionKey } from '@/lib/divisionTheme';

type Rgb = [number, number, number];

const NAVY: Rgb = [15, 23, 42];
const SLATE: Rgb = [51, 65, 85];
const MUTED: Rgb = [100, 116, 139];
const LINE: Rgb = [226, 232, 240];
const WHITE: Rgb = [255, 255, 255];

const DIVISI_META: Record<DivisionKey, {
    rgb: Rgb;
    softRgb: Rgb;
    contohProyek: string;
    contohKategori: string;
}> = {
    'DIVISI 1': {
        rgb: [37, 99, 235],
        softRgb: [239, 246, 255],
        contohProyek: 'Pembangunan Gedung Kantor Kementerian / RSUD / Sekolah Rakyat',
        contohKategori: 'gedung, sekolah-rakyat, rumah-sakit, bandara',
    },
    'DIVISI 2': {
        rgb: [13, 148, 136],
        softRgb: [240, 253, 250],
        contohProyek: 'Pembangunan Bendungan / Jaringan Irigasi / Embung / PLTM',
        contohKategori: 'bendungan, irigasi-jiat, embung, pengaman-pantai',
    },
    'DIVISI 3': {
        rgb: [217, 119, 6],
        softRgb: [255, 251, 235],
        contohProyek: 'Pembangunan Jalan Tol / Jembatan / Infrastruktur Transportasi',
        contohKategori: 'jalan-tol, jembatan, infrastruktur, perpipaan',
    },
};

const WIN_ANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
function aman(s: string): string {
    return Array.from(s)
        .map(ch => (ch.charCodeAt(0) <= 255 || WIN_ANSI_EXTRA.has(ch) ? ch : '-'))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

function labelDivisi(divisi: DivisionKey): string {
    return DIVISION_THEME[divisi].short; // "Divisi 1" | "Divisi 2" | "Divisi 3"
}

export function namaFilePanduanDivisi(divisi: DivisionKey): string {
    return `Panduan-Admin-${labelDivisi(divisi).replace(/\s+/g, '-')}-TENGOK.pdf`;
}

async function loadLogoDataUrl(): Promise<string | null> {
    try {
        const res = await fetch('/LOGO_ABIPRAYA.png');
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export async function buatPdfPanduanAdminDivisi(divisi: DivisionKey): Promise<jsPDF> {
    const [{ jsPDF: JsPdf }, { default: autoTable }, logoDataUrl] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        loadLogoDataUrl(),
    ]);

    const theme = DIVISION_THEME[divisi];
    const meta = DIVISI_META[divisi];
    const divLabel = labelDivisi(divisi);
    const accent = meta.rgb;

    const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 16;
    const CW = pageW - M * 2;
    let y = M;

    const ensureSpace = (needMm: number) => {
        if (y + needMm > pageH - 18) {
            doc.addPage();
            y = 18;
        }
    };

    const sectionTitle = (num: string, title: string) => {
        ensureSpace(22);
        y += 3;
        doc.setFillColor(...accent);
        doc.roundedRect(M, y - 4.2, 2.5, 6.2, 1, 1, 'F');
        doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...NAVY);
        doc.text(aman(`${num}. ${title}`), M + 5.5, y);
        y += 3.5;
        doc.setDrawColor(...LINE).setLineWidth(0.3);
        doc.line(M, y, pageW - M, y);
        y += 5;
    };

    const subTitle = (title: string) => {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...accent);
        doc.text(aman(title), M, y);
        y += 4.8;
    };

    const para = (text: string, size = 9.5, color: Rgb = SLATE) => {
        doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color);
        const lines = doc.splitTextToSize(aman(text), CW) as string[];
        ensureSpace(lines.length * 4.3 + 2);
        doc.text(lines, M, y);
        y += lines.length * 4.3 + 2;
    };

    const bulletList = (items: Array<{ bold?: string; text: string }>) => {
        for (const item of items) {
            const full = item.bold ? `${item.bold} — ${item.text}` : item.text;
            doc.setFont('helvetica', 'normal').setFontSize(9.3);
            const lines = doc.splitTextToSize(aman(full), CW - 6) as string[];
            ensureSpace(lines.length * 4.2 + 2);
            doc.setFillColor(...accent);
            doc.circle(M + 2, y - 1.2, 0.9, 'F');
            if (item.bold) {
                doc.setFont('helvetica', 'bold').setTextColor(...NAVY);
                const prefix = aman(`${item.bold} — `);
                const firstLine = lines[0];
                if (firstLine.startsWith(prefix)) {
                    doc.text(prefix, M + 5.5, y);
                    const pw = doc.getTextWidth(prefix);
                    doc.setFont('helvetica', 'normal').setTextColor(...SLATE);
                    doc.text(firstLine.slice(prefix.length), M + 5.5 + pw, y);
                } else {
                    doc.setFont('helvetica', 'normal').setTextColor(...SLATE);
                    doc.text(firstLine, M + 5.5, y);
                }
            } else {
                doc.setTextColor(...SLATE);
                doc.text(lines[0], M + 5.5, y);
            }
            doc.setFont('helvetica', 'normal').setTextColor(...SLATE);
            for (let i = 1; i < lines.length; i++) {
                y += 4.2;
                doc.text(lines[i], M + 5.5, y);
            }
            y += 5.2;
        }
        y += 1;
    };

    const callout = (title: string, text: string, bg: Rgb = meta.softRgb, border: Rgb = accent) => {
        doc.setFont('helvetica', 'normal').setFontSize(9);
        const lines = doc.splitTextToSize(aman(text), CW - 10) as string[];
        const boxH = 9 + lines.length * 4.1;
        ensureSpace(boxH + 4);
        doc.setFillColor(...bg);
        doc.setDrawColor(...border).setLineWidth(0.35);
        doc.roundedRect(M, y, CW, boxH, 2, 2, 'FD');
        doc.setFillColor(...border);
        doc.rect(M, y, 2.2, boxH, 'F');
        doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...border);
        doc.text(aman(title), M + 5.5, y + 5.5);
        doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...SLATE);
        doc.text(lines, M + 5.5, y + 10.2);
        y += boxH + 4.5;
    };

    // ── Header / Cover Card ──────────────────────────────────────────────────
    doc.setFillColor(...NAVY);
    doc.roundedRect(M, y, CW, 46, 3, 3, 'F');
    doc.setFillColor(...accent);
    doc.rect(M, y + 43, CW, 3, 'F');

    if (logoDataUrl) {
        try {
            doc.addImage(logoDataUrl, 'PNG', M + 6, y + 6, 15, 15);
        } catch {
            // abaikan bila format gambar gagal dimuat
        }
    }

    const titleX = logoDataUrl ? M + 25 : M + 7;
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...accent);
    doc.text(aman(`PT BRANTAS ABIPRAYA (PERSERO)  •  ${divisi} (${theme.title.toUpperCase()})`), titleX, y + 10);

    doc.setFont('helvetica', 'bold').setFontSize(17.5).setTextColor(...WHITE);
    doc.text(aman(`Panduan Admin ${divLabel}`), titleX, y + 18.5);

    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(203, 213, 225);
    const subLines = doc.splitTextToSize(
        aman(`Aplikasi TENGOK — Pengelolaan Proyek, Kamera CCTV, & Monitoring Pengisian Data (${theme.tagline})`),
        CW - (titleX - M) - 6,
    ) as string[];
    doc.text(subLines, titleX, y + 25.5);

    const tglCetak = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date());
    doc.setFontSize(8).setTextColor(148, 163, 184);
    doc.text(aman(`Edisi Dokumen: ${tglCetak}  |  Khusus Pengguna Terdaftar Admin ${divLabel}`), M + 7, y + 39.5);
    y += 53;

    para(theme.description, 9.5, SLATE);

    callout(
        `Ruang Lingkup Admin ${divLabel}`,
        `Sebagai Admin ${divLabel}, akun SSO Anda memiliki kewenangan penuh untuk mendaftarkan dan mengelola proyek serta kamera CCTV milik ${divisi}. Data dari divisi lain maupun pengaturan sistem pusat (Statistik, Audit Log, Hak Akses, Kategori Global, Share Link) tidak ditampilkan demi keamanan dan kerapian kerja.`,
    );

    // ── Tabel Hak Akses ──────────────────────────────────────────────────────
    subTitle('Ringkasan Hak Akses Menu Admin');
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        theme: 'grid',
        head: [['Menu / Fitur', 'Akses Anda', 'Keterangan']],
        body: [
            ['Dashboard Operasional (/admin)', 'Ya (Terbatas Divisi)', `Ringkasan total kamera, SLA online/offline, dan lokasi proyek khusus ${divisi}.`],
            ['Manajemen Kamera (/admin/cameras)', 'Ya (Terbatas Divisi)', `Daftar kamera baru, uji koneksi stream RTSP, import CSV, dan tautkan ke proyek ${divisi}.`],
            ['Lokasi Proyek (/admin/locations)', 'Ya (Terbatas Divisi)', `Daftar proyek baru, set titik koordinat peta, PM proyek, dan tautkan kamera ${divisi}.`],
            ['Pengisian Proyek (/admin/pengisian)', 'Ya (Terbatas Divisi)', `Pantau kelengkapan 18 dimensi data proyek ${divisi} dan unduh PDF rekap divisi.`],
            ['Detail Proyek (/project/[id])', 'Ya (Edit Penuh Divisi)', `Isi/perbarui 5 tab proyek, Laporan Bulanan, Kurva S, QHSSE, galeri & dokumen untuk proyek ${divisi}.`],
            ['Kategori, Share Links, Statistik, Uptime, Notifikasi, Hak Akses, Audit Log', 'Tidak (Pusat)', 'Dikelola terpusat oleh Super-admin untuk seluruh perusahaan.'],
        ],
        styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 2.3, textColor: SLATE, lineColor: LINE, lineWidth: 0.2 },
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 52, fontStyle: 'bold', textColor: NAVY },
            1: { cellWidth: 34, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: CW - 86 },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 1) {
                const v = String(data.cell.raw || '');
                if (v.startsWith('Ya')) data.cell.styles.textColor = [21, 128, 61];
                else data.cell.styles.textColor = [185, 28, 28];
            }
        },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;

    // ── Bab 1: Cara Masuk & Alur Kerja ───────────────────────────────────────
    sectionTitle('1', 'Cara Masuk & Urutan Kerja yang Disarankan');
    bulletList([
        { bold: '1. Login Menggunakan Akun SSO', text: 'Buka halaman /login, pilih tab Login SSO, lalu masuk dengan akun Cognito/perusahaan Anda. Catatan: Login PIN hanya untuk mode lihat (viewer) dan tidak dapat membuka Panel Admin.' },
        { bold: '2. Masuk ke Panel Admin', text: 'Setelah berhasil login, klik tombol "Management" (ikon roda gigi di pojok kanan atas halaman /categories) untuk masuk ke Dashboard Admin.' },
        { bold: '3. Langkah A — Daftarkan Lokasi Proyek', text: `Buka menu Lokasi Proyek terlebih dahulu agar proyek ${divisi} beserta titik koordinatnya tersedia di sistem.` },
        { bold: '4. Langkah B — Daftarkan & Tautkan Kamera', text: 'Buka menu Kamera, masukkan nama & URL RTSP/HLS kamera, uji dengan tombol Test, lalu langsung centang Lokasi Proyek tujuan di dalam modal yang sama.' },
        { bold: '5. Langkah C — Pantau Pengisian Data', text: `Buka menu Pengisian Proyek untuk memeriksa kelengkapan 18 dimensi data proyek ${divisi} dan mengingatkan PIC proyek bila masih ada dimensi yang kosong.` },
    ]);

    // ── Bab 2: Mengelola Lokasi Proyek ───────────────────────────────────────
    sectionTitle('2', `Mengelola Lokasi Proyek (${divLabel})`);
    para(`Di menu Lokasi Proyek (/admin/locations), daftar yang tampil sudah otomatis disaring khusus untuk proyek milik ${divisi}.`);
    bulletList([
        { bold: 'Menambah Proyek Baru', text: `Klik tombol "Daftarkan Proyek". Isi Nama Lokasi/Proyek (contoh: ${meta.contohProyek}), pilih Kategori (mis. ${meta.contohKategori}), dan pilih Tipe Proyek (JO / Non-JO).` },
        { bold: 'Divisi Terkunci Otomatis', text: `Field Divisi otomatis terisi dan terkunci ke "${divisi}" sehingga setiap proyek baru langsung tercatat di divisi Anda.` },
        { bold: 'Menentukan Titik Koordinat Peta', text: 'Ketik nama kota/kecamatan pada kolom Cari Lokasi lalu pilih hasil, atau klik langsung titik lokasi pada peta Leaflet, atau isi Latitude & Longitude secara manual.' },
        { bold: 'Foto & Info Project Manager', text: 'Unggah foto tampak proyek dan lengkapi Nama PM serta No. WhatsApp PM (format 628xxx) agar muncul pada panel informasi peta publik.' },
        { bold: 'Menautkan Kamera', text: 'Pada bagian "Integrasi Kamera", centang kamera yang terpasang di proyek ini lalu klik Simpan Proyek.' },
    ]);

    // ── Bab 3: Mengelola Kamera CCTV ─────────────────────────────────────────
    sectionTitle('3', `Mengelola Kamera CCTV (${divLabel})`);
    para(`Menu Kamera (/admin/cameras) menampilkan seluruh kamera yang terdaftar di ${divisi} beserta kamera yang terpasang pada proyek ${divisi}.`);
    subTitle('3.1 Menambah & Menautkan Kamera (1 Langkah)');
    bulletList([
        { bold: 'Klik "Tambah Kamera"', text: 'Isi Nama Perangkat CCTV yang jelas (contoh: "CCTV Tower Crane 1 - Proyek X").' },
        { bold: 'Masukkan Stream URL & Uji Koneksi', text: 'Tempel URL RTSP atau HLS (mis. rtsp://user:pass@ip:554/stream1). Klik tombol "Test" di sebelahnya untuk memastikan server TENGOK dapat menjangkau kamera sebelum disimpan.' },
        { bold: 'Langsung Tautkan ke Proyek', text: 'Gunakan kotak pencarian pada bagian "Tautkan ke Lokasi Proyek" di bagian bawah modal dan centang proyek tujuan. Anda juga dapat melepas tautan atau memindahkan lokasi kamera dari modal Edit kapan saja.' },
    ]);

    subTitle('3.2 Import Massal dari CSV');
    bulletList([
        { bold: 'Unduh Template', text: 'Klik "Import CSV" -> klik "Template" untuk mendapatkan format kolom name,streamUrl.' },
        { bold: 'Pilih Lokasi Tujuan (Opsional)', text: 'Unggah file .csv Anda, periksa pratinjau data yang valid, lalu pilih Lokasi Proyek tujuan bila semua kamera di file CSV tersebut berasal dari proyek yang sama.' },
    ]);

    subTitle('3.3 Tampilan Tabel, Kartu, & Aksi Cepat');
    bulletList([
        { bold: 'Mode Tabel & Kartu', text: 'Gunakan tombol ikon List/Grid di kanan atas filter untuk beralih antara tampilan Tabel padat (15 kamera/halaman) atau Kartu (8 kamera/halaman).' },
        { bold: 'Filter & Pencarian', text: 'Saring kamera berdasarkan status (Online, Offline, Belum Terpasang, Sudah Terpasang), pilih filter Lokasi Proyek tertentu, atau cari berdasarkan nama/URL.' },
        { bold: 'Aksi Baris & Aksi Massal', text: 'Tiap baris punya tombol cepat Preview Live, Cek Status, Edit & Tautkan Lokasi, dan Hapus. Centang beberapa kamera untuk memunculkan bar aksi massal (Cek Status, Tautkan ke Lokasi, Export CSV, Hapus).' },
    ]);

    callout(
        'Keamanan Kredensial RTSP',
        'Password pada URL RTSP disamarkan otomatis pada tampilan daftar kamera. Jangan membagikan URL RTSP mentah beserta username/password kamera ke pihak eksternal; untuk membagikan tayangan ke pihak luar, mintalah Super-admin membuatkan Share Link berbatas waktu.',
        [255, 247, 237],
        [234, 88, 12],
    );

    // ── Bab 4: Rekap Pengisian & Detail Proyek ───────────────────────────────
    sectionTitle('4', `Rekap Pengisian & Detail Proyek (${divLabel})`);
    bulletList([
        { bold: 'Pantau Pengisian 18 Dimensi (/admin/pengisian)', text: `Halaman ini menampilkan tingkat kelengkapan 18 dimensi data seluruh proyek ${divisi} (diurutkan dari yang paling sedikit terisi). Klik "Unduh PDF ${divLabel}" untuk mengunduh laporan rekap siap kirim ke tim proyek.` },
        { bold: 'Mengisi Detail Proyek (/project/[id])', text: `Selain PIC yang ditunjuk, Admin ${divisi} dapat langsung membuka halaman Detail Proyek (dari Peta -> klik marker proyek -> tombol "Detail") untuk melengkapi tab Ringkasan, Finansial, Operasi, Change Management, QHSSE, Laporan Bulanan (Kurva S), serta Galeri & Dokumen lewat menu "Kelola Data".` },
    ]);

    // ── Bab 5: Pemecahan Masalah Umum ────────────────────────────────────────
    sectionTitle('5', 'Tanya Jawab & Pemecahan Masalah Umum');
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        theme: 'grid',
        head: [['Kendala yang Ditemui', 'Penyebab & Solusi']],
        body: [
            ['Menu Kategori / Statistik / Audit Log tidak tampil di sidebar', `Wajar. Menu tersebut dikhususkan untuk Super-admin pusat agar Admin ${divLabel} fokus pada pengelolaan proyek dan kamera divisinya.`],
            ['Kamera berstatus Offline atau gagal saat klik "Test"', 'Pastikan IP/domain kamera bisa diakses publik (bukan IP lokal 192.168.x.x tanpa port-forward/VPN), port 554 terbuka, serta username, password, dan path RTSP sudah benar.'],
            ['Proyek lama di divisi saya tidak muncul di Lokasi Proyek', 'Kemungkinan proyek tersebut belum memiliki label divisi di database. Hubungi Super-admin pusat untuk menetapkan field Divisi proyek tersebut.'],
            ['Kategori proyek yang dibutuhkan belum ada di pilihan', 'Kategori bersifat global lintas divisi. Ajukan pembuatan kategori baru ke Super-admin pusat.'],
            ['Perlu menunjuk PIC proyek atau Admin Divisi baru', 'Penambahan PIC proyek dan penetapan role Admin Divisi dilakukan oleh Super-admin pusat melalui menu Hak Akses / Kelola Data -> PIC Proyek.'],
        ],
        styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 2.5, textColor: SLATE, lineColor: LINE, lineWidth: 0.2 },
        headStyles: { fillColor: accent, textColor: WHITE, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 62, fontStyle: 'bold', textColor: NAVY },
            1: { cellWidth: CW - 62 },
        },
    });

    // ── Footer di setiap halaman ─────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...LINE).setLineWidth(0.25);
        doc.line(M, pageH - 12, pageW - M, pageH - 12);
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
        doc.text(aman(`TENGOK • Panduan Operasional Admin ${divLabel} (${theme.title})`), M, pageH - 7.5);
        doc.text(aman(`Halaman ${i} / ${totalPages}`), pageW - M, pageH - 7.5, { align: 'right' });
    }

    return doc;
}

export async function unduhPdfPanduanAdminDivisi(divisi: DivisionKey): Promise<void> {
    const doc = await buatPdfPanduanAdminDivisi(divisi);
    doc.save(namaFilePanduanDivisi(divisi));
}
