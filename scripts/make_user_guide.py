# -*- coding: utf-8 -*-
"""
Menghasilkan PDF Panduan Pengguna (User Guide) Tengok — versi RAMAH PENGGUNA.

Ditujukan untuk petugas proyek yang mengisi data (BUKAN orang teknis/IT).
Bahasa dibuat sederhana, langkah demi langkah, tanpa jargon.

Struktur menu di panduan ini mengikuti halaman /project/[id]:
  Beranda · Ringkasan (CPI / SPI) · Cash & Keuangan · Operasi · Laporan Bulanan ·
  Change Management · Isu & Kendala · Lainnya (Informasi, Lokasi, Kontrak, Progres, Galeri, Dokumen)

Gambar  : scripts/guide-img/*.png (buat ulang dengan: node scripts/guide_shots.mjs)
Jalankan: python scripts/make_user_guide.py
Output  : public/Panduan-Input-Detail-Proyek.pdf
"""
import os
from io import BytesIO
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    ListFlowable, ListItem, HRFlowable, PageBreak, Image, KeepTogether
)

# ── Palet warna (tema Abipraya: biru tua + kuning/oranye) ───────────────────
NAVY = colors.HexColor('#0f172a')
SLATE = colors.HexColor('#334155')
SLATE_LIGHT = colors.HexColor('#64748b')
AMBER = colors.HexColor('#f59e0b')
AMBER_DK = colors.HexColor('#b45309')
BG_SOFT = colors.HexColor('#f8fafc')
BG_AMBER = colors.HexColor('#fffbeb')
BG_BLUE = colors.HexColor('#eff6ff')
LINE = colors.HexColor('#e2e8f0')

# ── Tautan ──────────────────────────────────────────────────────────────────
# Spreadsheet pendaftaran PIC (username SSO + nama proyek) yang dibagikan admin.
PIC_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1tY8XWli4iPRfTJCNBUiRJbNL8GqXGAbTVCBS1WcIH-Q/edit?usp=sharing'
GREEN_DK = colors.HexColor('#047857')

EDISI = 'Oktober 2026'

OUT = 'public/Panduan-Input-Detail-Proyek.pdf'
LOGO = 'public/LOGO_ABIPRAYA.png'

styles = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=styles['Title'], fontName='Helvetica-Bold',
                    fontSize=26, textColor=NAVY, spaceAfter=4, leading=30)
SUB = ParagraphStyle('SUB', parent=styles['Normal'], fontName='Helvetica',
                     fontSize=11, textColor=SLATE_LIGHT, spaceAfter=2, alignment=TA_CENTER, leading=16)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Helvetica-Bold',
                    fontSize=15, textColor=AMBER_DK, spaceBefore=16, spaceAfter=6, leading=19)
H3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Helvetica-Bold',
                    fontSize=12, textColor=NAVY, spaceBefore=9, spaceAfter=3, leading=16, keepWithNext=1)
BODY = ParagraphStyle('BODY', parent=styles['Normal'], fontName='Helvetica',
                      fontSize=10.5, textColor=SLATE, leading=16, spaceAfter=4, alignment=TA_LEFT)
BODY_C = ParagraphStyle('BODY_C', parent=BODY, alignment=TA_CENTER)
SMALL = ParagraphStyle('SMALL', parent=styles['Normal'], fontName='Helvetica',
                       fontSize=8.5, textColor=SLATE_LIGHT, leading=12)
NOTE = ParagraphStyle('NOTE', parent=BODY, fontSize=10, textColor=AMBER_DK, leading=15)
TIP = ParagraphStyle('TIP', parent=BODY, fontSize=10, textColor=GREEN_DK, leading=15)
STEP = ParagraphStyle('STEP', parent=BODY, fontSize=10.5, textColor=SLATE, leading=16)


def bullets(items):
    lst = [ListItem(Paragraph(t, BODY)) for t in items]
    return ListFlowable(lst, bulletType='bullet', bulletColor=AMBER,
                        bulletFontSize=7, leftIndent=14, spaceBefore=2, spaceAfter=6)


def numbered(items):
    lst = [ListItem(Paragraph(t, STEP), spaceb=4) for t in items]
    return ListFlowable(lst, bulletType='1', bulletColor=AMBER_DK,
                        bulletFontName='Helvetica-Bold',
                        leftIndent=18, spaceBefore=2, spaceAfter=8)


def box(text, title, bg, border, title_color):
    inner = [Paragraph(f'<b>{title}</b>', ParagraphStyle('bt', parent=BODY, textColor=title_color, fontName='Helvetica-Bold', spaceAfter=3))]
    if isinstance(text, str):
        inner.append(Paragraph(text, BODY))
    else:
        inner.extend(text)
    t = Table([[inner]], colWidths=[164 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LINEBEFORE', (0, 0), (0, -1), 3, border),
        ('BOX', (0, 0), (-1, -1), 0.5, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    return t


def callout(text, title='Catatan'):
    return box(text, title, BG_AMBER, AMBER, AMBER_DK)


def tipbox(text, title='Tips'):
    return box(text, title, colors.HexColor('#ecfdf5'), colors.HexColor('#10b981'), GREEN_DK)


def field_table(rows, col1='Yang Diisi'):
    data = [[Paragraph(f'<b>{col1}</b>', ParagraphStyle('th', parent=BODY, textColor=colors.white)),
             Paragraph('<b>Penjelasan Sederhana</b>', ParagraphStyle('th2', parent=BODY, textColor=colors.white))]]
    for f, k in rows:
        data.append([Paragraph(f'<b>{f}</b>', BODY), Paragraph(k, BODY)])
    t = Table(data, colWidths=[46 * mm, 118 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_SOFT]),
        ('GRID', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def hr():
    return HRFlowable(width='100%', thickness=0.6, color=LINE, spaceBefore=6, spaceAfter=6)


def logo_img(h_mm):
    """Logo Abipraya dengan tinggi tertentu (mm), rasio asli 79x71."""
    if not os.path.exists(LOGO):
        return Spacer(1, h_mm * mm)
    ratio = 79 / 71
    h = h_mm * mm
    return Image(LOGO, width=h * ratio, height=h)


# ── Header & footer tiap halaman (kecuali cover) ────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Header: logo kecil + judul
    if os.path.exists(LOGO):
        try:
            canvas.drawImage(LOGO, 18 * mm, h - 15 * mm, width=8 * mm, height=8 * mm,
                             mask='auto', preserveAspectRatio=True)
        except Exception:
            pass
    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(SLATE_LIGHT)
    canvas.drawString(29 * mm, h - 12 * mm, 'PANDUAN PENGISIAN DATA PROYEK — TENGOK')
    canvas.drawRightString(w - 18 * mm, h - 12 * mm, 'PT Brantas Abipraya (Persero)')
    canvas.setStrokeColor(AMBER)
    canvas.setLineWidth(1.5)
    canvas.line(18 * mm, h - 16 * mm, w - 18 * mm, h - 16 * mm)
    # Footer
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 14 * mm, w - 18 * mm, 14 * mm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(SLATE_LIGHT)
    canvas.drawString(18 * mm, 10 * mm, 'Butuh bantuan? Hubungi admin / tim IT Anda.')
    canvas.drawRightString(w - 18 * mm, 10 * mm, f'Halaman {doc.page - 1}')
    canvas.restoreState()


def on_cover(canvas, doc):
    # Cover polos (tanpa header/footer), ada aksen garis atas-bawah.
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 10 * mm, w, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(AMBER)
    canvas.rect(0, h - 12 * mm, w, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(AMBER)
    canvas.rect(0, 10 * mm, w, 2 * mm, fill=1, stroke=0)
    canvas.restoreState()


# ── Gambar panduan (diambil otomatis: node scripts/guide_shots.mjs) ───────────
IMG_DIR = 'scripts/guide-img'
# Potong gambar (piksel asli, DSF 2): (kiri, atas, kanan, bawah); None = batas gambar.
# Dipakai untuk membuang bagian berulang (kartu "Setup awal") atau ruang kosong.
CROPS = {
    '01-menu-proyek.png': (0, 195, 480, 1815),
    '03-laporan-setup.png': (0, 0, None, 1700),
    '04-rencana-tahunan.png': (0, 380, None, None),
    '05-isi-laporan.png': (0, 380, None, 1860),
    '06-edit-laporan-lengkap.png': (0, 380, None, None),
    '07-saldo-awal.png': (0, 380, None, 1020),
    '09-cash-keuangan.png': (0, 0, None, 1100),
}
CAP = ParagraphStyle('CAP', parent=styles['Normal'], fontName='Helvetica-Oblique',
                     fontSize=8.5, textColor=SLATE_LIGHT, leading=12, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10)
def _img(name, width_mm):
    """Gambar berbingkai tipis dari IMG_DIR (dipotong sesuai CROPS, dimampatkan JPEG)."""
    path = os.path.join(IMG_DIR, name)
    if not os.path.exists(path):
        print('PERINGATAN: gambar tidak ada, dilewati:', path)
        return None
    im = PILImage.open(path).convert('RGB')
    box = CROPS.get(name)
    if box:
        l, t, r, b = box
        im = im.crop((l, t, r or im.width, b or im.height))
    buf = BytesIO()
    im.save(buf, 'JPEG', quality=88, optimize=True)
    buf.seek(0)
    w = width_mm * mm
    h = w * im.height / im.width
    t = Table([[Image(buf, width=w, height=h)]], colWidths=[w + 2])
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 1), ('RIGHTPADDING', (0, 0), (-1, -1), 1),
        ('TOPPADDING', (0, 0), (-1, -1), 1), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    t.hAlign = 'CENTER'
    return t
def shot(name, caption, width_mm=140):
    """Gambar + keterangan, tidak terpisah antar halaman. [] bila berkas tidak ada."""
    t = _img(name, width_mm)
    if t is None:
        return []
    return [KeepTogether([Spacer(1, 2 * mm), t, Paragraph(caption, CAP)])]
def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title='Panduan Pengisian Data Proyek — Tengok',
        author='PT Brantas Abipraya',
    )
    E = []

    # ══ COVER ════════════════════════════════════════════════════════════════
    E.append(Spacer(1, 38 * mm))
    E.append(logo_img(34))
    E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Panduan Pengisian Data Proyek', H1))
    E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Aplikasi Tengok — Project Management Information System', SUB))
    E.append(Paragraph('PT Brantas Abipraya (Persero)', SUB))
    E.append(Spacer(1, 10 * mm))
    E.append(box(
        'Panduan ini dibuat sesederhana mungkin. Anda tidak perlu paham teknologi '
        'untuk mengisi data proyek — cukup ikuti langkah-langkahnya. '
        'Isi yang Anda tahu saja; kolom yang belum ada datanya boleh dikosongkan dan '
        'diisi kemudian.',
        'Untuk Siapa Panduan Ini?', BG_BLUE, colors.HexColor('#3b82f6'), colors.HexColor('#1d4ed8')))
    E.append(Spacer(1, 6 * mm))
    E.append(Paragraph(f'Edisi {EDISI} · Dokumen Internal', BODY_C))
    E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Tampilan aplikasi dapat sedikit berbeda seiring pembaruan.', SMALL))
    E.append(PageBreak())

    # ══ 1. INTI YANG PERLU DIINGAT ═══════════════════════════════════════════
    E.append(Paragraph('Hal Penting Sebelum Mulai', H2))
    E.append(numbered([
        'Anda harus <b>masuk memakai akun kantor (SSO)</b> — bukan hanya PIN. '
        'Kalau masuk dengan PIN, Anda hanya bisa melihat, tidak bisa mengisi.',
        'Anda harus <b>terdaftar sebagai PIC</b> pada proyek yang ingin diisi. '
        'Tanpa itu, tombol Edit tidak akan aktif untuk proyek tersebut (lihat kotak di bawah).',
        'Setelah syarat di atas terpenuhi, akan muncul tombol <b>"Edit"</b> (gambar pensil) '
        'di setiap bagian. Itu tandanya Anda boleh mengisi.',
        'Isi data proyek <b>milik Anda sendiri</b>. Pilih proyek yang tepat sebelum mengisi.',
        'Setelah mengisi, <b>selalu tekan tombol "Simpan"</b>. Kalau tidak ditekan, '
        'data tidak tersimpan.',
    ]))
    E.append(tipbox(
        'Tidak yakin dengan sebuah kolom? <b>Kosongkan saja.</b> Lebih baik kosong '
        'daripada salah isi. Kolom bisa dilengkapi kapan saja nanti.',
        'Tenang, Tidak Bisa Rusak'))

    # ══ PENTING: Pendaftaran PIC (penyebab utama "tidak bisa edit") ══════════
    E.append(Paragraph('Kenapa Saya Tidak Bisa Mengedit? (Pendaftaran PIC)', H2))
    E.append(Paragraph(
        'Demi keamanan data, setiap proyek hanya dapat diedit oleh pengguna yang '
        '<b>terdaftar sebagai PIC (penanggung jawab) proyek tersebut</b>. Jadi meskipun '
        'Anda sudah masuk lewat SSO, tombol Edit <b>tidak akan aktif</b> pada proyek '
        'yang bukan tanggung jawab Anda sampai akun Anda didaftarkan sebagai PIC-nya.', BODY))
    E.append(Paragraph('Cara agar bisa mengedit proyek Anda:', H3))
    E.append(numbered([
        'Pastikan Anda pernah <b>login ke aplikasi Tengok memakai akun SSO</b> minimal sekali '
        '(agar akun Anda terbaca sistem).',
        'Daftarkan diri sebagai PIC dengan mengisi <b>username (akun SSO) dan nama proyek</b> '
        'yang menjadi tanggung jawab Anda pada spreadsheet pendaftaran berikut: '
        f'<link href="{PIC_SHEET_URL}" color="#2563eb"><u>Spreadsheet Pendaftaran PIC</u></link>.',
        'Admin akan <b>mendaftarkan Anda sebagai PIC</b> proyek tersebut.',
        'Setelah terdaftar, <b>muat ulang</b> halaman — tombol Edit akan aktif pada '
        'proyek Anda, dan Anda bisa mulai mengisi data.',
    ]))
    E.append(callout(
        'Belum didaftarkan sebagai PIC? Isi <b>username SSO</b> dan <b>nama proyek</b> '
        'yang Anda tangani di '
        f'<link href="{PIC_SHEET_URL}" color="#2563eb"><u>Spreadsheet Pendaftaran PIC</u></link>, '
        'atau hubungi admin/tim IT Anda. Ini syarat wajib sebelum bisa mengedit.', 'Butuh Akses Edit'))

    # ══ 2. CARA MASUK & MEMBUKA PROYEK ═══════════════════════════════════════
    E.append(Paragraph('Langkah 1 — Masuk & Membuka Proyek Anda', H2))
    E.append(numbered([
        'Buka aplikasi Tengok di browser (Chrome/Edge).',
        'Pilih <b>masuk dengan akun kantor (SSO)</b> dan selesaikan proses login.',
        'Setelah masuk, Anda akan melihat <b>animasi pembuka</b> gedung kantor pusat. '
        'Tekan <b>Enter</b> atau <b>Spasi</b> untuk memulai, atau <b>Esc</b> untuk '
        'melewatinya. Animasi ini hanya tampil sekali setiap kali Anda membuka aplikasi.',
        'Pilih salah satu dari <b>3 Divisi</b> (Divisi 1, 2, atau 3), lalu pilih '
        '<b>kategori proyek</b> di dalam divisi tersebut. Anda juga bisa memakai '
        'kotak pencarian kategori atau tombol panah di keyboard.',
        'Akan tampil <b>peta</b>. Klik <b>titik/penanda</b> lokasi proyek Anda '
        '(hijau = kamera CCTV mayoritas online, merah = mayoritas offline).',
        'Pada panel yang muncul, klik tombol <b>"Detail"</b> di pojok kanan atas panel.',
        'Anda sekarang berada di <b>halaman proyek</b>. Di sinilah semua data diisi.',
    ]))
    E.append(tipbox(
        'Tombol <b>"Panduan"</b> di pojok atas halaman utama (dan di halaman login) '
        'selalu membuka panduan ini kembali kapan pun Anda butuh. Pengguna yang kurang '
        'nyaman dengan animasi bisa memakai tampilan hemat gerak dengan menambahkan '
        '<b>?reduced=1</b> di akhir alamat halaman kategori.', 'Panduan Selalu Tersedia'))
    E.append(Spacer(1, 3 * mm))
    E.append(callout(
        'Tombol <b>"Edit"</b> / <b>"Unggah"</b> tidak muncul? Dua kemungkinan: '
        '(1) Anda belum masuk dengan akun kantor (SSO) — keluar lalu masuk lagi lewat SSO; '
        'atau (2) Anda <b>belum terdaftar sebagai PIC</b> proyek itu — lihat bagian '
        '"Kenapa Saya Tidak Bisa Mengedit?" di atas.', 'Kalau Tombol Edit Tidak Ada'))

    # ══ 3. PETA MENU HALAMAN PROYEK ══════════════════════════════════════════
    E.append(Paragraph('Mengenal Menu di Halaman Proyek', H2))
    E.append(Paragraph(
        'Di sisi kiri halaman proyek ada daftar menu. Berikut isi tiap menu '
        'dan kapan Anda memakainya:', BODY))
    E.append(field_table([
        ('Beranda', 'Gambaran umum proyek + <b>indikator kelengkapan data</b>. '
                    'Mulailah dari sini untuk tahu bagian mana yang belum diisi.'),
        ('Ringkasan', 'Nilai kinerja <b>CPI / SPI</b> (biaya &amp; jadwal) beserta CV dan SV. '
                      'Terisi otomatis dari Laporan Bulanan.'),
        ('Cash &amp; Keuangan', 'Tagihan, kas masuk/keluar, hutang, piutang, CCC, hasil usaha, '
                                'dan penyerapan anggaran (DIPA).'),
        ('Operasi', 'Kinerja Operasi (PU/BK/LK), <b>Progress Mingguan</b>, Milestone, '
                    'Sumber Daya, dan Monitoring Pengadaan.'),
        ('Laporan Bulanan', '<b>Pusat pengisian angka rutin tiap bulan</b>: Earned Value, Kurva S, hasil usaha, '
                            'arus kas, posisi keuangan (hutang, BAD, piutang, CCC), tagihan, dan pengadaan. Juga tempat Rencana Tahunan dan Saldo Awal Kas.'),
        ('Change Management', 'Catatan perubahan harga/lingkup, klaim, dan masalah hukum.'),
        ('Isu &amp; Kendala', 'Isu strategis dan kendala di lapangan beserta penanganannya.'),
        ('Lainnya', 'Informasi, Lokasi, Kontrak, Progres, dan Galeri.'),
    ], col1='Menu'))
    E.append(Spacer(1, 3 * mm))

    _menu = _img('01-menu-proyek.png', 40)
    if _menu is not None:
        _side = [
            Paragraph('<b>Cara membaca menu</b>', BODY),
            Paragraph('Menu aktif ditandai <b>warna biru</b>. Klik nama menu untuk berpindah.', BODY),
            Paragraph('Urutan yang disarankan: mulai dari <b>Beranda</b> (cek yang belum diisi), lalu '
                      '<b>Laporan Bulanan</b> untuk angka rutin, kemudian menu lain sesuai kebutuhan.', BODY),
            Paragraph('Di layar HP, menu dibuka lewat tombol <b>garis tiga (☰)</b> di bagian atas halaman.', BODY),
            Paragraph('<i>Gambar: menu samping halaman proyek.</i>', CAP),
        ]
        _t = Table([[_menu, _side]], colWidths=[46 * mm, 118 * mm])
        _t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (1, 0), (1, 0), 10)]))
        E.append(_t)
        E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Cara Memakai Indikator Kelengkapan (di Menu Beranda)', H3))
    E.append(Paragraph(
        'Di bagian atas menu <b>Beranda</b> ada kartu <b>"Kelengkapan Data Proyek"</b> '
        'berisi persen kelengkapan dan daftar bagian yang <b>belum diisi</b>. '
        'Klik nama bagian tersebut — Anda langsung dibawa ke menu yang harus diisi. '
        'Hijau = hampir lengkap, kuning = setengah jalan, merah = masih banyak yang kosong.', BODY))

    E.extend(shot('02-beranda-kelengkapan.png',
                  'Kartu Kelengkapan Data di menu Beranda. Bagian yang belum diisi (di contoh ini: Laporan bulanan) '
                  'tampil sebagai tombol yang bisa diklik.', 150))
    # ══ 4. CARA MENGISI (POLA UMUM) ══════════════════════════════════════════
    E.append(Paragraph('Langkah 2 — Pola Mengisi (Sama di Semua Bagian)', H2))
    E.append(numbered([
        'Pilih menu di sisi kiri (misalnya "Cash &amp; Keuangan", "Operasi", atau "Laporan Bulanan").',
        'Klik tombol <b>"Edit"</b> (pensil) di kanan atas bagian yang ingin diisi. '
        'Satu menu bisa punya beberapa bagian, masing-masing punya tombol Edit sendiri.',
        'Isi kolom yang tersedia. Untuk daftar (seperti tahun anggaran, bulan progress '
        'mingguan, atau item pengadaan), gunakan tombol <b>"Tambah"</b> untuk menambah baris, '
        'dan ikon <b>tempat sampah</b> untuk menghapus baris.',
        'Klik <b>"Simpan"</b>. Muncul tulisan "tersimpan" → berarti berhasil.',
        'Kalau salah/ingin batal, klik <b>"Batal"</b> sebelum menyimpan.',
    ]))
    E.append(callout(
        'Untuk kolom <b>uang</b>, ketik angkanya saja tanpa titik atau koma. '
        'Contoh: untuk Rp 400 juta, ketik <b>400000000</b>. Aplikasi akan '
        'merapikan tampilannya sendiri.', 'Cara Menulis Angka Uang'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout(
        'Setiap bagian punya tombol Simpan sendiri. Jika Anda mengedit dua bagian '
        'sekaligus dalam satu menu (misalnya Kinerja Operasi dan Milestone), '
        '<b>simpan satu per satu</b> sebelum pindah ke bagian lain.', 'Simpan Per Bagian'))

    E.append(PageBreak())

    # ══ 5A. LAPORAN BULANAN ══════════════════════════════════════════════════
    E.append(Paragraph('Laporan Bulanan — Isi Rutin Tiap Bulan', H2))
    E.append(Paragraph(
        'Menu <b>Laporan Bulanan</b> adalah tempat mengisi angka yang <b>berubah setiap bulan</b>. '
        'Sekali diisi di sini, angkanya langsung dipakai di grafik dan kartu pada peta serta halaman proyek '
        '(Kurva S, CPI/SPI, arus kas, hutang/piutang, hasil usaha, pengadaan). Anda <b>tidak perlu mengetik angka yang sama dua kali</b>.', BODY))
    E.append(field_table([
        ('Sekali di awal (Setup)', 'Nilai kontrak, <b>Rencana Tahunan</b> (Kurva S + rencana hasil usaha), '
                                  'dan <b>Saldo Awal Kas</b> (hanya jika perlu).'),
        ('Setiap bulan', 'Isi satu laporan untuk bulan itu: Earned Value, realisasi Kurva S, hasil usaha, '
                         'arus kas, posisi keuangan, tagihan, dan pengadaan.'),
        ('Setiap awal tahun', 'Isi Rencana Tahunan untuk tahun yang baru.'),
    ], col1='Kapan'))
    E.append(Spacer(1, 2 * mm))
    E.append(tipbox(
        'Di bagian atas menu ada kartu <b>"Setup awal"</b> yang menunjukkan mana yang sudah dicentang (✓) dan mana yang belum '
        'diisi, lengkap dengan tombol langsung ke bagian yang dimaksud. Kartu ini terlipat sendiri '
        'setelah semua yang wajib selesai.', 'Mulai dari Kartu Setup Awal'))
    E.extend(shot('03-laporan-setup.png',
                  'Menu Laporan Bulanan: kartu Setup awal (terbuka), tiga tab, pemilih periode, kotak oranye '
                  '"Belum dilaporkan", lalu hasil hitung CPI/SPI/CV/SV dan blok isian.', 125))
    # ── Setup awal ──
    E.append(Paragraph('A. Setup Awal (Cukup Sekali)', H3))
    E.append(Paragraph('<b>1) Nilai kontrak</b> — isi di menu <b>Lainnya → Kontrak</b>. '
                       'Nilai ini dipakai sebagai pembagi untuk menghitung persen pada Kurva S.', BODY))
    E.append(Paragraph('<b>2) Rencana Tahunan</b> — buka menu Laporan Bulanan → tab <b>Rencana Tahunan</b>:', BODY))
    E.append(numbered([
        'Pilih <b>Tahun</b>, lalu klik <b>"Isi rencana"</b>.',
        'Pilih <b>Satuan</b> angka: Rp, Juta, atau Miliar. Ketik angka sesuai satuan yang dipilih '
        '(di bawah kolom akan tampil terjemahan "Rp ... M" agar Anda yakin).',
        'Isi <b>Target PU RKAP</b> (target pendapatan usaha setahun).',
        'Isi tabel 12 bulan (Jan–Des). Ada lima baris: <b>RA RKAP</b> (sekaligus rencana pendapatan) dan '
        '<b>RA Eksternal</b> untuk Kurva S, serta <b>HPP, EBITDA, Laba Bersih</b> (rencana hasil usaha).',
        'Klik <b>Simpan</b>.',
    ]))
    E.append(callout(
        'Isi nilai <b>kumulatif</b> (jumlah dari awal proyek s.d akhir bulan itu), bukan nilai per bulan. '
        'Satu baris harus diisi <b>lengkap 12 bulan atau dikosongkan seluruhnya</b>. '
        'Nilai RA RKAP, RA Eksternal, dan HPP <b>tidak boleh turun</b> dari bulan ke bulan '
        '(EBITDA dan Laba Bersih boleh).', 'Aturan Rencana Tahunan'))
    E.append(Spacer(1, 2 * mm))
    E.append(tipbox(
        'Jangan ketik satu per satu. <b>Salin dari Excel</b> (satu baris atau beberapa baris sekaligus), '
        'klik sel mana pun di tabel, lalu tekan <b>Ctrl+V</b>. Satu baris Excel mengisi ke kanan; '
        'beberapa baris mengisi baris-baris di bawahnya sesuai urutan. Format angka Indonesia (1.234,5) '
        'maupun internasional (1,234.5) dikenali. Angka mengikuti <b>satuan yang sedang dipilih</b>, '
        'jadi pilih satuan dulu sebelum menempel.', 'Tempel dari Excel'))
    E.append(Spacer(1, 2 * mm))
    E.extend(shot('04-rencana-tahunan.png',
                  'Tab Rencana Tahunan saat mengisi. Pilih satuan di atas, lalu isi atau tempel angka dari Excel. '
                  'Geser tabel ke kanan untuk melihat bulan berikutnya.', 150))
    E.append(Paragraph('<b>3) Saldo Awal Kas (opsional)</b> — tab <b>Saldo Awal Kas</b>. Isi hanya jika proyek sudah '
                       'berjalan <b>sebelum</b> laporan bulanan pertama: total Cash In dan Cash Out sampai sebelum laporan '
                       'pertama. Total Cash In/Out di menu Cash &amp; Keuangan dihitung otomatis = saldo awal + '
                       'semua laporan bulanan. Bila laporan bulanan dimulai dari awal proyek, lewati bagian ini.', BODY))
    E.extend(shot('07-saldo-awal.png',
                  'Tab Saldo Awal Kas: dua angka saldo awal, dan total Cash In/Out yang dihitung otomatis '
                  '(saldo awal + semua laporan bulanan).', 135))
    # ── Isi tiap bulan ──
    E.append(Paragraph('B. Mengisi Laporan Setiap Bulan', H3))
    E.append(numbered([
        'Buka menu <b>Laporan Bulanan</b> → tab <b>Laporan Bulanan</b>.',
        'Pilih <b>Periode laporan</b>. Daftar menunjukkan status tiap bulan ("terisi 15/20", "belum diisi", "kosong"). '
        'Bulan yang terlewat tampil di kotak oranye <b>"Belum dilaporkan"</b> — klik nama bulannya untuk langsung membukanya.',
        'Klik <b>"Isi laporan"</b> (atau <b>"Edit"</b> bila bulan itu sudah pernah diisi).',
        'Pilih <b>Satuan</b> (Rp / Juta / Miliar) lalu isi tiap blok. Blok yang sudah lengkap otomatis terlipat; '
        'lencana <b>"n/m"</b> di judul blok menunjukkan jumlah kolom terisi. Klik judul blok untuk membuka/menutup.',
        'Perhatikan tanda <b>peringatan oranye</b> di bawah kolom (lihat penjelasan di bawah).',
        'Klik <b>Simpan</b>. Tulisan "tersimpan" muncul bila berhasil.',
    ]))
    E.append(field_table([
        ('Earned Value (EVM)', '<b>BAC, BCWS, BCWP, ACWP</b> — nilai kumulatif s.d akhir bulan. '
                               'CPI, SPI, CV, SV langsung dihitung dan tampil di bagian atas saat Anda mengetik.'),
        ('Hasil Usaha – Bulan Ini', 'Pendapatan, HPP, EBITDA, dan Laba Bersih <b>khusus bulan ini</b>.'),
        ('Hasil Usaha – s.d Bulan Ini', '<b>Terisi otomatis</b> = s.d bulan lalu + bulan ini (dalam tahun yang sama). '
                                        'Hapus centang "Hitung otomatis" bila ingin mengisi sendiri. '
                                        '<b>Pendapatan s.d bulan ini sekaligus menjadi realisasi (RI) pada Kurva S</b>, jadi tidak diisi dua kali.'),
        ('Rencana s.d bulan ini', '<b>Tidak diisi di sini.</b> Dibaca otomatis dari Rencana Tahunan.'),
        ('Cash Flow Bulan Ini', '<b>Cash In</b> dan <b>Cash Out</b> khusus bulan ini.'),
        ('Posisi Keuangan', '<b>Saldo hutang, BAD, piutang</b> (saldo di akhir bulan) dan <b>CCC</b> (dalam hari). '
                            'Ini saldo, bukan arus: isi posisi pada akhir bulan itu. Tampil di menu Cash &amp; Keuangan.'),
        ('Tagihan', '<b>Tagihan bruto</b> (posisi saat ini) dan <b>target tagihan</b> (satu angka target).'),
        ('Pengadaan', '<b>Total paket</b>, <b>paket terealisasi</b>, <b>total pagu</b>, dan <b>pagu terealisasi</b> '
                      '(kumulatif s.d bulan ini).'),
    ], col1='Blok'))
    E.append(Spacer(1, 3 * mm))
    E.append(Paragraph('Istilah EVM dengan Bahasa Sederhana', H3))
    E.append(field_table([
        ('BAC', 'Total anggaran <b>biaya</b> proyek sampai selesai. Relatif tetap tiap bulan.'),
        ('BCWS', 'Nilai pekerjaan yang <b>direncanakan</b> sudah selesai s.d bulan ini.'),
        ('BCWP', 'Nilai pekerjaan yang <b>benar-benar sudah dicapai</b> s.d bulan ini.'),
        ('ACWP', 'Biaya yang <b>sudah dikeluarkan</b> untuk mencapai pekerjaan itu s.d bulan ini.'),
        ('CPI', '= BCWP : ACWP. 1 ke atas = hemat; di bawah 1 = boros. <i>Dihitung otomatis.</i>'),
        ('SPI', '= BCWP : BCWS. 1 ke atas = sesuai/lebih cepat; di bawah 1 = terlambat. <i>Dihitung otomatis.</i>'),
        ('CV / SV', 'CV = BCWP − ACWP (selisih biaya); SV = BCWP − BCWS (selisih jadwal). '
                    'Negatif = merugikan. <i>Dihitung otomatis.</i>'),
    ], col1='Istilah'))
    E.append(Spacer(1, 3 * mm))
    E.append(Paragraph('CPI dan SPI: Dari Mana Angkanya?', H3))
    E.append(Paragraph(
        'CPI dan SPI <b>tidak diketik</b>. Aplikasi menghitungnya sendiri dari empat angka EVM yang Anda isi, '
        'dan kartunya langsung berubah saat Anda mengetik (lihat gambar). Yang perlu Anda siapkan hanya '
        '<b>BAC, BCWS, BCWP, dan ACWP</b>, semuanya nilai <b>kumulatif</b> sejak awal proyek s.d akhir bulan laporan.', BODY))
    E.append(field_table([
        ('BAC', 'Anggaran biaya total proyek. Ambil dari RAB / RAP yang disetujui.'),
        ('BCWS', 'Nilai pekerjaan yang <b>seharusnya</b> selesai s.d bulan ini menurut jadwal. Ambil dari rencana (kurva S rencana) dikali BAC.'),
        ('BCWP', 'Nilai pekerjaan yang <b>sudah benar-benar selesai</b> s.d bulan ini. Ambil dari progres fisik terverifikasi dikali BAC.'),
        ('ACWP', 'Biaya yang <b>sudah benar-benar keluar</b> s.d bulan ini. Ambil dari laporan biaya aktual / buku besar proyek. '
                 '<b>ACWP tidak otomatis sama dengan HPP</b>, jadi isi dari laporan biaya aktual.'),
    ], col1='Angka'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout(
        '<b>CPI = BCWP : ACWP</b> (1 ke atas = biaya hemat). <b>SPI = BCWP : BCWS</b> (1 ke atas = jadwal sesuai atau lebih cepat). '
        'Pada gambar di bawah: BCWP 411.970,5 : ACWP 411.804,16 = 1,00 dan BCWP 411.970,5 : BCWS 415.000 = 0,99 '
        '(angka dalam Juta). Hasil diambil dari laporan periode terbaru dan dibulatkan 2 desimal. '
        'Kalau BCWS atau ACWP kosong, CPI/SPI tidak tampil.', 'Rumus yang Dipakai'))
    E.append(Spacer(1, 2 * mm))
    E.extend(shot('16-evm-cpi-spi.png',
                  'Blok Earned Value. Empat kartu di atas (CPI, SPI, CV, SV) dihitung otomatis dari empat kolom di bawahnya. '
                  'Hijau = sesuai target, merah = di bawah target.', 150))
    E.append(Spacer(1, 3 * mm))
    E.append(Paragraph('Posisi Keuangan: Hutang, BAD, Piutang, CCC', H3))
    E.append(Paragraph(
        'Empat angka ini dulu diisi di menu Cash &amp; Keuangan. Sekarang diisi <b>sekali sebulan di sini</b>, '
        'lalu otomatis tampil di Cash &amp; Keuangan dan tidak perlu diketik lagi. Isi saldo pada <b>akhir bulan laporan</b>. '
        'CCC diisi dalam hari; di atas 90 hari ditandai merah (perlu perhatian).', BODY))
    E.extend(shot('17-posisi-keuangan.png',
                  'Blok Posisi Keuangan di Laporan Bulanan. Di bawah tiap kolom tampil terjemahan nilainya (Rp ... M).', 150))
    E.append(Spacer(1, 3 * mm))
    E.append(Paragraph('Fitur yang Memudahkan', H3))
    E.append(bullets([
        '<b>Hitung otomatis "s.d bulan ini"</b> — cukup isi "bulan ini"; angka s.d terisi sendiri.',
        '<b>Salin data tetap</b> — tombol ini menyalin <b>BAC, total paket, dan total pagu</b> dari laporan sebelumnya '
        'ke kolom yang masih kosong (untuk periode baru, ini terjadi otomatis). Angka bulanan sengaja tidak disalin.',
        '<b>Peringatan oranye</b> — muncul bila angka tampak janggal: jauh berbeda (lebih dari 10 kali lipat atau kurang dari '
        'sepersepuluh) dari bulan lalu, angka kumulatif yang justru turun, atau lebih dari 5 kali nilai kontrak. '
        'Biasanya tandanya <b>salah satuan</b>. Anda tetap boleh menyimpan setelah konfirmasi.',
        '<b>Penanda kelengkapan</b> — kartu Beranda memuat butir "Laporan bulanan" yang hijau bila laporan bulan ini atau '
        'bulan lalu sudah ada.',
    ]))
    E.extend(shot('05-isi-laporan.png',
                  'Mengisi laporan bulan baru. Di bawah tiap kolom tampil terjemahan "Rp ... M/Jt". Pada contoh ini BCWP '
                  'sengaja diketik 59 padahal satuannya Juta, sehingga muncul peringatan oranye dan CPI/SPI menjadi 0,00. '
                  'Kolom BAC sudah terisi dari tombol "Salin data tetap".', 140))
    E.extend(shot('06-edit-laporan-lengkap.png',
                  'Laporan yang sudah lengkap: setiap blok bertanda ✓ dan terlipat otomatis. Klik judul blok untuk '
                  'membukanya kembali.', 140))
    E.append(Paragraph('Contoh Pengisian Singkat', H3))
    E.append(Paragraph(
        'Anda memilih satuan <b>Juta</b>. Laporan Agustus: BCWP Rp 59 miliar, ACWP Rp 62,5 miliar, BCWS Rp 63 miliar.', BODY))
    E.append(field_table([
        ('Kolom BCWP', 'Ketik <b>59000</b> (Juta). Di bawah kolom tampil "Rp 59,00 M" — benar.'),
        ('Kolom ACWP', 'Ketik <b>62500</b>. Tampil "Rp 62,50 M".'),
        ('Kolom BCWS', 'Ketik <b>63000</b>. Tampil "Rp 63,00 M".'),
        ('Hasil otomatis', 'CPI = 0,94 · SPI = 0,94 · CV = −Rp 3,50 M · SV = −Rp 4,00 M. Keduanya di bawah 1 (merah).'),
    ], col1='Langkah'))
    E.append(Spacer(1, 3 * mm))
    # ── Otomatis ──
    E.append(Paragraph('C. Yang Terisi Otomatis (Jangan Diketik Lagi)', H3))
    E.append(Paragraph(
        'Begitu laporan bulanan tersimpan, data berikut diperbarui sendiri mengikuti <b>laporan periode terbaru</b>:', BODY))
    E.append(field_table([
        ('CPI, SPI (+ CV, SV)', 'Dihitung dari EVM. Tampil di menu <b>Ringkasan</b> dan panel peta.'),
        ('Saldo Hutang, BAD, Piutang, CCC', 'Dari blok Posisi Keuangan. Tampil sebagai kartu di Cash &amp; Keuangan.'),
        ('Tagihan Bruto', 'Dari blok Tagihan. Tampil di Cash &amp; Keuangan.'),
        ('Hasil Usaha dan PU', 'Dari "Hasil Usaha s.d bulan ini": Pendapatan = PU, Biaya = HPP, Laba = Pendapatan − HPP. '
                               'Tampil di Cash &amp; Keuangan dan Operasi. <b>BK tidak sama dengan HPP</b>, jadi BK tetap diisi '
                               'sendiri di menu Operasi, dan LK dihitung = PU − BK.'),
        ('Cash In / Cash Out (total)', 'Saldo awal + jumlah semua laporan bulanan. Saldo Kas ikut menyesuaikan, '
                                       'kecuali Anda pernah mengisinya manual.'),
        ('Kurva S', 'Realisasi (RI) = Pendapatan s.d bulan ini; rencana (RA RKAP) = rencana pendapatan di Rencana Tahunan. '
                    'Progres fisik (menu Progres) <b>bukan</b> turunan Kurva S dan tetap diisi sendiri.'),
    ], col1='Data'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout(
        'Kolom-kolom di atas akan <b>terkunci</b> (tidak bisa diketik) di menu aslinya dan diberi catatan '
        '"diisi otomatis dari Laporan Bulanan", lengkap dengan tombol menuju Laporan Bulanan. Untuk mengubahnya, '
        'ubah laporan bulanannya. <b>Sebelum ada laporan bulanan</b>, kolom-kolom itu masih bisa diisi manual seperti biasa.',
        'Kenapa Kolom Ini Tidak Bisa Diketik?'))
    E.extend(shot('08-ringkasan.png',
                  'Menu Ringkasan setelah laporan diisi: CPI, SPI, CV, dan SV tampil otomatis beserta catatan sumbernya.', 135))
    E.extend(shot('09-cash-keuangan.png',
                  'Menu Cash & Keuangan: Saldo Hutang, BAD, Piutang, dan CCC tampil dari Laporan Bulanan '
                  '(ada catatan dan tombol menuju Laporan Bulanan).', 135))
    # ── Peta ──
    E.append(Paragraph('D. Di Mana Data Ini Tampil di Peta?', H3))
    E.append(Paragraph('Panel yang terbuka saat Anda mengklik proyek di peta ikut menampilkan data laporan bulanan:', BODY))
    E.append(field_table([
        ('Tab Ringkasan', '<b>Kurva S</b> tahun berjalan (garis RA RKAP, RA Eksternal, dan RI; arahkan kursor atau '
                          'tekan panah kiri/kanan untuk melihat nilai per bulan), serta <b>CPI, SPI, CV, SV</b>.'),
        ('Tab Finansial', '<b>Arus Kas Bulanan</b> (Cash In vs Cash Out), <b>Tagihan vs Target</b>, '
                          'dan tabel <b>Hasil Usaha</b> (bulan ini · s.d bulan ini · rencana).'),
        ('Tab Operasi', '<b>Ringkasan Pengadaan</b>: jumlah paket dan progres pagu (realisasi dan sisa).'),
    ], col1='Tab di Panel'))
    E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Kartu-kartu ini hanya muncul bila proyek sudah punya laporan bulanan. Grafik menampilkan '
                       '<b>satu tahun</b>, yaitu tahun laporan yang terakhir diisi.', BODY))
    E.extend(shot('10-peta-kurva-s.png',
                  'Panel peta, tab Ringkasan: kartu Realisasi, Rencana, dan Deviasi untuk bulan terpilih, bar PU terhadap RKAP, lalu grafik Kurva S. '
                  'Klik chip di bawah grafik untuk menyembunyikan satu garis; tabel Rp miliar per bulan dibuka lewat tombol "Lihat tabel".', 112))
    E.extend(shot('11-peta-cpi-spi.png',
                  'Panel peta, tab Ringkasan: CPI, SPI, serta CV dan SV.', 112))
    E.extend(shot('12-peta-arus-kas.png',
                  'Panel peta, tab Finansial: Arus Kas Bulanan (Cash In dan Cash Out, dalam Rp miliar).', 112))
    E.extend(shot('13-peta-tagihan.png',
                  'Panel peta, tab Finansial: Tagihan Bruto dibanding target tagihan.', 112))
    E.extend(shot('14-peta-hasil-usaha.png',
                  'Panel peta, tab Finansial: Hasil Usaha (bulan ini, s.d bulan ini, dan rencana).', 112))
    E.extend(shot('15-peta-pengadaan.png',
                  'Panel peta, tab Operasi: Ringkasan Pengadaan (jumlah paket dan progres pagu).', 112))
    # ── Kesalahan umum ──
    E.append(Paragraph('E. Kesalahan yang Sering Terjadi', H3))
    E.append(bullets([
        '<b>Salah satuan</b> — mengetik 59 miliar sebagai 59 padahal satuan Juta. Selalu lihat terjemahan "Rp ... M" di bawah kolom.',
        '<b>Mengisi nilai bulanan di kolom kumulatif</b> — BCWS, BCWP, ACWP, dan RI adalah nilai <b>kumulatif</b> (dari awal proyek).',
        '<b>Mengisi angka s.d di kolom "bulan ini"</b> — "Bulan Ini" hanya angka bulan itu saja.',
        '<b>Nilai kontrak belum diisi</b> — persen pada Kurva S tidak bisa dihitung (basis persen = nilai kontrak).',
        '<b>Rencana Tahunan belum diisi</b> — Kurva S hanya menampilkan garis realisasi, dan rencana hasil usaha kosong.',
        '<b>Lupa menekan Simpan</b> — isi tiap tab (Laporan Bulanan, Rencana Tahunan, Saldo Awal Kas) disimpan sendiri-sendiri.',
    ]))
    E.append(PageBreak())

    # ══ 5. PENJELASAN TIAP MENU ══════════════════════════════════════════════
    E.append(Paragraph('Penjelasan Tiap Menu', H2))
    E.append(Paragraph('Berikut arti tiap bagian dengan bahasa sehari-hari. '
                       'Isi yang relevan dengan proyek Anda.', BODY))

    # ── CPI / SPI ──
    E.append(Paragraph('Menu Ringkasan (CPI / SPI)', H3))
    E.append(Paragraph('Dua angka nilai kinerja proyek (plus CV dan SV bila ada). <b>Bila Laporan Bulanan sudah '
                       'diisi lengkap dengan BCWP dan ACWP/BCWS, angka ini terisi dan terkunci otomatis</b> — Anda '
                       'tidak perlu mengetiknya. Bila belum, isi manual dari laporan EVA; kalau tidak punya, '
                       'kosongkan. Aplikasi menampilkan status otomatis '
                       '(Under/Over Budget dan Ahead/Behind Schedule).', BODY))
    E.append(field_table([
        ('CPI', 'Nilai kinerja biaya. Contoh: 1,02. Angka 1 ke atas = hemat/efisien '
                '(Under Budget); di bawah 1 = boros (Over Budget).'),
        ('SPI', 'Nilai kinerja waktu. Contoh: 0,98. Angka 1 ke atas = sesuai/lebih cepat '
                '(Ahead Schedule); di bawah 1 = terlambat (Behind Schedule).'),
    ], col1='Kolom'))

    # ── Cash & Keuangan ──
    E.append(Paragraph('Menu Cash &amp; Keuangan', H3))
    E.append(field_table([
        ('Tagihan Bruto', 'Total tagihan bruto proyek.'),
        ('Cash In', 'Total uang yang sudah masuk/diterima proyek.'),
        ('Cash Out', 'Total uang yang sudah keluar/dibelanjakan.'),
        ('Saldo Kas', 'Sisa kas. Boleh dikosongkan — dihitung otomatis dari '
                      'Cash In dikurangi Cash Out.'),
        ('Saldo Hutang', 'Total hutang proyek. <b>Diisi di Laporan Bulanan</b> (blok Posisi Keuangan).'),
        ('BAD', 'Beban yang Akan Dibayar, bagian dari hutang. Diisi di Laporan Bulanan.'),
        ('Piutang', 'Uang yang masih ditunggu/belum dibayar ke proyek. Diisi di Laporan Bulanan.'),
        ('CCC', 'Lama perputaran kas dalam HARI. Diisi di Laporan Bulanan. '
                'Lebih dari 90 hari ditandai merah (perlu perhatian).'),
        ('Hasil Usaha', 'Isi <b>Pendapatan Usaha</b> dan <b>Biaya/HPP</b>. '
                        'Laba (atau rugi) dan margin dihitung otomatis.'),
        ('Progress Keuangan (DIPA)', 'Rincian anggaran per tahun: <b>Pagu/Rencana</b> vs <b>Realisasi</b>. '
                                     'Tekan "Tambah Tahun" untuk menambah baris, "Hapus tahun ini" untuk menghapus.'),
        ('Progress Belum Ditagihkan', 'Nilai pekerjaan yang sudah berjalan tetapi belum ditagihkan. '
                                      'Ada di dalam bagian Progress Keuangan.'),
    ], col1='Kolom'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout('Setelah Laporan Bulanan diisi, kolom <b>Tagihan Bruto</b>, <b>Cash In</b>, <b>Cash Out</b>, '
                     '<b>Hasil Usaha</b>, <b>Saldo Hutang, BAD, Piutang, dan CCC</b> di menu ini terkunci dan mengikuti laporan terbaru (lihat bagian '
                     '"Laporan Bulanan"). Hutang, BAD, piutang, dan CCC tetap tampil sebagai kartu. '
                     'Yang masih diisi di sini: Progress Keuangan (DIPA) dan Progress Belum Ditagihkan.', 'Sebagian Kolom Diisi Otomatis'))
    E.append(Spacer(1, 2 * mm))
    E.append(tipbox('Angka BAD, hutang, piutang, dan CCC biasanya ada di laporan cashflow bulanan '
                    'proyek. Salin ke blok Posisi Keuangan di Laporan Bulanan. CPI dan SPI tidak perlu '
                    'dihitung sendiri (lihat bagian "CPI dan SPI: Dari Mana Angkanya?").', 'Dari Mana Angkanya?'))

    # ── Operasi ──
    E.append(Paragraph('Menu Operasi', H3))
    E.append(Paragraph('Menu ini punya <b>lima bagian</b>, masing-masing dengan tombol Edit sendiri:', BODY))

    E.append(Paragraph('1) Kinerja Operasi (PU / BK / LK)', H3))
    E.append(Paragraph('Bila Laporan Bulanan sudah berisi "Hasil Usaha s.d bulan ini", bagian ini <b>terisi otomatis dan '
                       'terkunci</b> untuk <b>PU</b> (= Pendapatan s.d bulan ini). <b>BK tetap diisi sendiri</b> karena berbeda dari HPP. '
                       'Bila belum ada laporan bulanan, PU juga diisi manual.', BODY))
    E.append(field_table([
        ('PU', 'Pendapatan Usaha dari sisi operasi proyek.'),
        ('BK', 'Beban Konstruksi (biaya konstruksi operasi). Diisi sendiri di sini; satu-satunya tempat mengisi BK.'),
        ('LK', 'Laba Kotor — <b>tidak perlu diisi</b>, dihitung otomatis = PU − BK. '
               'Tampil merah bila rugi.'),
    ], col1='Kolom'))

    E.append(Paragraph('2) Progress Mingguan (W1–W4) · RA / RI', H3))
    E.append(Paragraph(
        'Catatan kemajuan fisik <b>per minggu, dikelompokkan per bulan</b>. '
        '<b>RA</b> = Rencana, <b>RI</b> = Realisasi (dalam persen). '
        'Cara mengisi:', BODY))
    E.append(numbered([
        'Klik <b>"Tambah Bulan"</b> (atau "Isi sekarang" bila masih kosong), lalu klik <b>Edit</b>.',
        'Tulis nama bulan (contoh: <i>Oktober 2026</i>) dan tahunnya.',
        'Untuk tiap minggu <b>W1 sampai W4</b>, isi angka <b>RA (%)</b> dan <b>RI (%)</b> '
        '(0–100, boleh desimal).',
        'Klik <b>Simpan</b>.',
    ]))
    E.append(Paragraph(
        'Setelah tersimpan, aplikasi menampilkan grafik batang dan tabel per minggu beserta '
        '<b>deviasi</b> (RI − RA). Hijau = realisasi sama/lebih dari rencana, merah = di bawah rencana.', BODY))
    E.append(callout(
        'Di <b>peta</b>, panel samping (tab <b>Operasi</b>) hanya menampilkan RA/RI untuk <b>bulan berjalan</b>. '
        'Agar tampil, tulis nama bulan dengan benar, misalnya <i>Oktober 2026</i>, dan isi kolom tahunnya. '
        'Riwayat bulan lain tetap bisa dilihat di halaman proyek → menu Operasi.', 'RA/RI di Peta'))

    E.append(Paragraph('3) Milestone (Tahapan Pekerjaan)', H3))
    E.append(Paragraph('Daftar tahapan besar proyek beserta kemajuannya. Tekan "Tambah Milestone", '
                       'tulis nama tahapan dan tanggal, lalu geser/isi persen kemajuannya (0–100). '
                       'Tahapan yang mencapai 100% otomatis ditandai selesai. '
                       'Progress keseluruhan dihitung otomatis dari rata-rata semua tahapan.', BODY))

    E.append(Paragraph('4) Sumber Daya', H3))
    E.append(Paragraph('Daftar alat, tenaga kerja, atau material di proyek. Tekan '
                       '"Tambah Sumber Daya". Tiap baris: <b>Nama</b>, <b>Kategori</b> '
                       '(Alat Berat / Tenaga Kerja / Material / Kendaraan / Peralatan), '
                       '<b>Jumlah</b>, dan <b>Satuan</b> (Unit / Orang / m³ / Ton / Set / Buah).', BODY))

    E.append(Paragraph('5) Monitoring Pengadaan', H3))
    E.append(Paragraph('Daftar barang/pengadaan penting (major item) beserta persen '
                       'progresnya. Tekan "Tambah Item", isi <b>Nama Item</b> dan '
                       '<b>Persentase</b> (0–100). Ada di bagian paling bawah menu Operasi.', BODY))

    # ── Change Management ──
    E.append(Paragraph('Menu Change Management', H3))
    E.append(Paragraph('Catatan perubahan pada proyek (harga, lingkup pekerjaan, klaim, '
                       'atau masalah hukum). Tekan "Tambah Perubahan", lalu isi:', BODY))
    E.append(field_table([
        ('Judul Perubahan', 'Nama singkat perubahannya.'),
        ('Jenis', 'Pilih salah satu: Perubahan Harga, Perubahan Lingkup, Klaim, '
                  'Legal Issue, atau Lain-lain.'),
        ('Deskripsi / Latar Belakang', 'Cerita singkat: apa yang berubah dan kenapa.'),
        ('Dampak Perubahan', 'Akibatnya ke proyek (biaya bertambah? waktu mundur? mutu?).'),
        ('Mitigasi', 'Langkah untuk menangani dampak itu.'),
        ('Nilai, Tanggal, Target Implementasi, PIC', 'Lengkapi bila ada.'),
        ('Status', 'Pilih: USULAN, DISETUJUI, atau DITOLAK.'),
    ], col1='Kolom'))

    # ── Isu & Kendala ──
    E.append(Paragraph('Menu Isu &amp; Kendala', H3))
    E.append(Paragraph('Menu ini punya dua bagian dengan tombol Edit masing-masing:', BODY))
    E.append(bullets([
        '<b>Isu Strategis</b> — tulis <b>Isu</b> dan <b>Usulan dari Abipraya</b> untuk menanganinya.',
        '<b>Kendala Operasional &amp; Kontraktual</b> — isi <b>Masalah</b>, <b>Penyebab</b>, '
        '<b>Tindakan</b>, <b>Harapan Dukungan</b>, <b>Target</b>, <b>PIC</b>, dan '
        '<b>Status</b> (OPEN / ON PROGRESS / CLOSED).',
        'Kendala yang perlu pengajuan perubahan bisa dipindahkan ke Change Management '
        'dengan satu klik tombol <b>"Masukkan ke Change Management"</b> di kartu kendala tersebut. '
        'Catatan baru muncul dengan status USULAN.',
    ]))

    # ── Lainnya ──
    E.append(Paragraph('Menu Lainnya', H3))
    E.append(Paragraph('Berisi lima bagian pendukung:', BODY))
    E.append(field_table([
        ('Informasi', 'Pengguna Jasa, Pengawas, Penyedia Jasa, Kontraktor, Status '
                      '(Perencanaan / Berjalan / Selesai), Tanggal Mulai &amp; Selesai, '
                      'nama dan kontak PIC, serta Deskripsi proyek.'),
        ('Lokasi', 'Titik lokasi proyek di peta, plus <b>Footprint Bangunan</b> (bentuk bangunan proyek yang tampil sebagai '
                   'blok 3D di peta). Cara menggambarnya ada di bawah.'),
        ('Kontrak', 'Nomor kontrak dan nilai kontrak. Masa pelaksanaan dihitung otomatis dari tanggal mulai dan selesai di bagian Informasi.'),
        ('Progres', 'Progress fisik: geser <b>Rencana</b> dan <b>Realisasi</b> (deviasi dihitung '
                    'otomatis). Diisi sendiri (bukan turunan Kurva S). Di sini juga ada <b>Lingkup Pekerjaan</b> — tekan "Tambah" '
                    'untuk menuliskan tiap lingkup.'),
        ('Galeri', 'Tekan <b>"Unggah Foto"</b> untuk menambah foto proyek (JPG/PNG). '
                   'Klik foto untuk melihat ukuran penuh; gunakan panah kiri/kanan untuk '
                   'berpindah foto dan <b>Esc</b> untuk menutup.'),
    ], col1='Bagian'))
    E.append(Spacer(1, 2 * mm))
    E.append(Paragraph('Menggambar Footprint Bangunan (menu Lainnya → Lokasi)', H3))
    E.append(Paragraph(
        'Footprint adalah bentuk bangunan proyek yang Anda gambar di atas citra satelit. '
        'Hasilnya tampil sebagai <b>blok 3D berwarna divisi</b> di peta, dan bangunan itu bisa diklik '
        'untuk membuka panel proyek. Gambar ini perlu karena banyak bangunan proyek belum ada di peta dunia.', BODY))
    E.append(numbered([
        'Buka menu <b>Lainnya → Lokasi</b>, lalu klik <b>"Gambar"</b> (atau <b>"Edit"</b> bila sudah ada).',
        'Titik <b>hijau</b> di peta adalah lokasi proyek. Perbesar peta (scroll atau tombol +/−) sampai bangunan terlihat jelas.',
        '<b>Klik di sudut-sudut bangunan</b> secara berurutan mengelilingi bangunan. Setiap klik menambah satu titik. '
        'Minimal <b>3 titik</b>.',
        'Salah klik? Klik titik oranye itu untuk menghapusnya, atau pakai <b>"Urungkan titik"</b>. '
        '<b>"Hapus semua"</b> mengosongkan gambar.',
        'Isi <b>Tinggi blok</b> dalam meter. Sebagai patokan, 1 lantai kira-kira 3–4 meter (bawaan 12 meter).',
        'Klik <b>"Simpan"</b>. Buka peta dan zoom dekat ke proyek; blok 3D akan muncul.',
    ]))
    E.append(bullets([
        'Tombol <b>gedung</b> di kontrol peta menyalakan/mematikan tampilan 3D. Bila dimatikan, bangunan tetap '
        'tampil sebagai bidang datar berwarna.',
        'Untuk menghapus footprint: <b>Edit → Hapus semua → Simpan</b>.',
    ]))
    E.append(bullets([
        'Ukuran tiap berkas maksimal <b>25 MB</b>.',
        'Saat menghapus foto, akan ada konfirmasi dulu — jadi aman.',
        'Progress Keuangan (DIPA) tidak lagi di menu Progres; sekarang ada di menu '
        '<b>Cash &amp; Keuangan</b>.',
    ]))

    # ══ 6. MENDAFTARKAN CCTV (RTSP) ══════════════════════════════════════════
    E.append(Paragraph('Mendaftarkan CCTV Proyek (URL RTSP)', H2))
    E.append(Paragraph(
        'Kamera CCTV ditampilkan di Tengok lewat <b>URL RTSP</b>. Pembagian tugasnya sederhana:', BODY))
    E.append(field_table([
        ('1. PIC proyek', 'Menyiapkan URL RTSP kamera, lalu <b>memastikan URL itu bisa dibuka dari luar '
                          'jaringan proyek</b> (dites memakai VLC dan paket data sendiri).'),
        ('2. PIC → Admin', 'PIC mengisi URL yang sudah lolos tes di <b>spreadsheet pendaftaran</b> '
                           '(sama dengan spreadsheet pendaftaran PIC).'),
        ('3. Admin Tengok', 'Mengimpor kamera ke aplikasi dan menautkannya ke proyek.'),
    ], col1='Siapa'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout(
        'PIC <b>tidak</b> mendaftarkan kamera sendiri di aplikasi. Tugas PIC cukup menyiapkan '
        'dan menguji URL RTSP, lalu mengisinya di spreadsheet untuk admin.', 'Pembagian Tugas'))

    # ── A. Untuk PIC ──
    E.append(Paragraph('Menyiapkan URL RTSP', H3))
    E.append(Paragraph('<b>Langkah 1 — Kumpulkan informasi kamera</b> (tanyakan ke teknisi CCTV proyek):', BODY))
    E.append(bullets([
        '<b>Alamat publik</b> kamera/NVR: nama domain (mis. <i>cctv.proyekanda.co.id</i>) '
        'atau IP publik. <b>Bukan IP lokal proyek</b> (lihat kotak peringatan di bawah).',
        '<b>Port</b> yang terbuka ke internet (bawaan RTSP biasanya 554; sering diganti, mis. 8554).',
        '<b>Username dan password</b> kamera/NVR.',
        '<b>Nomor channel</b> kamera dan jenis stream: <b>main stream</b> (kualitas tinggi) atau '
        '<b>sub stream</b> (lebih ringan). Untuk Tengok, <b>sub stream lebih disarankan</b> '
        'karena hemat bandwidth dan lancar saat dibuka banyak kamera sekaligus.',
    ]))

    E.append(Paragraph('<b>Langkah 2 — Susun URL RTSP</b> dengan format:', BODY))
    E.append(box(
        '<font face="Courier" size="10">rtsp://USERNAME:PASSWORD@ALAMAT-PUBLIK:PORT/PATH</font>',
        'Format URL RTSP', BG_SOFT, SLATE_LIGHT, NAVY))
    E.append(Spacer(1, 3 * mm))
    E.append(Paragraph('Contoh berikut memakai alamat <b>contoh</b>. Ganti dengan alamat publik, '
                       'port, dan kredensial kamera proyek Anda:', BODY))
    E.append(field_table([
        ('Hikvision (main stream)',
         '<font face="Courier" size="8.5">rtsp://admin:PasswordAnda@cctv.proyekanda.co.id:8554/Streaming/Channels/101</font><br/>'
         'Channel 1, stream utama. Untuk <b>sub stream</b> pakai akhiran <font face="Courier" size="8.5">/102</font>. '
         'Channel 2 = <font face="Courier" size="8.5">/201</font> (main) atau <font face="Courier" size="8.5">/202</font> (sub).'),
        ('Dahua (sub stream)',
         '<font face="Courier" size="8.5">rtsp://admin:PasswordAnda@203.0.113.25:554/cam/realmonitor?channel=1&amp;subtype=1</font><br/>'
         '<font face="Courier" size="8.5">subtype=0</font> = main stream, <font face="Courier" size="8.5">subtype=1</font> = sub stream. '
         'Ganti <font face="Courier" size="8.5">channel=</font> sesuai nomor kamera.'),
        ('Merk lain / umum',
         '<font face="Courier" size="8.5">rtsp://user:PasswordAnda@cctv.proyekanda.co.id:554/stream1</font><br/>'
         'Path berbeda-beda tiap merk. Lihat buku manual kamera/NVR atau tanyakan ke teknisi CCTV.'),
    ], col1='Merk'))
    E.append(Spacer(1, 3 * mm))
    E.append(tipbox(
        'Disarankan memakai password kamera yang hanya berisi <b>huruf dan angka</b>. '
        'Karakter khusus seperti <b>@ # : / ?</b> bisa merusak URL. Kalau terpaksa dipakai, '
        'karakter itu harus ditulis dalam bentuk kode, misalnya @ menjadi <b>%40</b> dan '
        '# menjadi <b>%23</b>. Bila ragu, ganti dulu passwordnya.', 'Soal Password'))
    E.append(Spacer(1, 3 * mm))
    E.append(callout(
        '<b>Alamat lokal TIDAK bisa dipakai.</b> Alamat yang diawali '
        '<b>192.168.x.x</b>, <b>10.x.x.x</b>, <b>172.16 sampai 172.31.x.x</b>, atau '
        '<b>127.0.0.1</b> hanya berlaku di dalam jaringan proyek. Server Tengok berada di luar '
        'jaringan itu, sehingga kamera tidak akan terhubung. Aplikasi bahkan menolak alamat '
        'lokal saat tes. Kamera harus dapat diakses lewat <b>alamat publik</b> (domain atau '
        'IP publik). Pengaturannya, misalnya port forwarding di router/modem proyek, dilakukan '
        'bersama tim IT atau penyedia internet proyek.', 'Penting: Harus Alamat Publik'))

    E.append(Spacer(1, 4 * mm))
    E.append(Paragraph('<b>Langkah 3 — Tes URL dari luar jaringan proyek dengan VLC</b>', BODY))
    E.append(Paragraph(
        'Tes ini memastikan kamera benar-benar bisa diakses dari internet, bukan hanya dari '
        'Wi-Fi proyek. <b>Gunakan paket data internet Anda sendiri</b>, bukan Wi-Fi proyek/kantor.', BODY))
    E.append(Paragraph('Lewat HP (paling mudah):', H3))
    E.append(numbered([
        'Pasang aplikasi <b>VLC</b> di HP (Android/iPhone).',
        '<b>Matikan Wi-Fi</b>, pastikan HP memakai <b>paket data seluler</b>.',
        'Buka VLC → menu <b>Stream</b> (atau <b>Network</b> / <b>Open Network Stream</b>).',
        'Tempel (paste) URL RTSP lengkap lalu tekan <b>Play</b>.',
        'Tunggu beberapa detik. Kalau <b>gambar kamera muncul</b>, URL lolos tes.',
    ]))
    E.append(Paragraph('Lewat laptop (alternatif):', H3))
    E.append(numbered([
        'Sambungkan laptop ke <b>hotspot dari HP</b> (paket data), bukan Wi-Fi proyek/kantor.',
        'Buka <b>VLC</b> → menu <b>Media → Open Network Stream</b> (Ctrl+N).',
        'Tempel URL RTSP di kolom <i>Network URL</i>, lalu klik <b>Play</b>.',
    ]))
    E.append(field_table([
        ('Gambar muncul lewat paket data', '<b>Lolos.</b> URL siap dikirim ke admin.'),
        ('Gagal / layar hitam / error, padahal di Wi-Fi proyek bisa',
         'Kamera belum terbuka ke internet (port forwarding atau alamat publik belum benar). '
         'Hubungi tim IT/teknisi proyek, perbaiki, lalu tes ulang.'),
        ('Gagal juga di Wi-Fi proyek', 'Kemungkinan URL salah (alamat, port, path, username, atau password). '
                                       'Periksa lagi satu per satu.'),
        ('Diminta username/password', 'Tulis di URL dengan format <font face="Courier" size="9">username:password@</font> '
                                      'seperti contoh di atas, atau masukkan saat VLC memintanya.'),
    ], col1='Hasil Tes'))
    E.append(Spacer(1, 2 * mm))
    E.append(callout(
        'Jangan tes memakai Wi-Fi proyek/kantor. Dari dalam jaringan yang sama, kamera bisa terlihat '
        'normal padahal dari internet tidak bisa dijangkau, sehingga hasil tesnya menyesatkan.',
        'Kenapa Harus Paket Data?'))

    E.append(Paragraph('<b>Langkah 4 — Kirim ke admin lewat spreadsheet</b>', BODY))
    E.append(Paragraph(
        'Setelah lolos tes, isi data kamera di spreadsheet yang <b>sama dengan pendaftaran PIC</b>: '
        f'<link href="{PIC_SHEET_URL}" color="#2563eb"><u>Spreadsheet Pendaftaran PIC &amp; CCTV</u></link>. '
        'Isi untuk <b>setiap kamera</b>:', BODY))
    E.append(bullets([
        '<b>Nama proyek</b> (sama persis dengan di Tengok).',
        '<b>Nama kamera</b> yang jelas, mis. <i>CCTV Gerbang Utama</i> atau <i>CCTV Area Pengecoran</i>.',
        '<b>URL RTSP lengkap</b> yang sudah lolos tes VLC.',
    ]))
    E.append(Paragraph(
        'Satu kamera = satu baris. Setelah mengisi, admin akan mengimpor kamera tersebut ke Tengok '
        'dan menautkannya ke proyek Anda.', BODY))
    E.append(callout(
        'URL RTSP memuat <b>username dan password</b> kamera. Isi hanya di spreadsheet resmi di atas, '
        'jangan kirim ke grup chat umum, dan jangan bagikan tautan spreadsheet ke pihak luar. '
        'Pakai password yang kuat, bukan password bawaan pabrik.', 'Jaga Kerahasiaan'))

    E.append(Paragraph('<b>Langkah 5 — Cek hasilnya</b>', BODY))
    E.append(Paragraph('Setelah admin memasang kamera, Anda bisa memastikannya sendiri:', BODY))
    E.append(bullets([
        'Buka <b>Peta</b>, cari proyek Anda. Marker <b>hijau</b> berarti mayoritas kamera online.',
        'Klik marker lalu buka kamera di panel untuk memastikan <b>video tampil</b>.',
        'Jika kamera belum muncul atau tetap offline, ulangi tes VLC dari paket data, lalu kabari admin.',
    ]))

    # ══ 7. KALAU ADA MASALAH ═════════════════════════════════════════════════
    E.append(Paragraph('Kalau Ada Masalah', H2))
    E.append(field_table([
        ('Tombol Edit tidak muncul / tidak bisa edit', 'Dua sebab: belum login SSO '
                                     '(keluar &amp; masuk lagi lewat SSO), ATAU belum terdaftar '
                                     'sebagai PIC proyek itu (daftarkan username SSO + nama '
                                     'proyek lewat spreadsheet pendaftaran PIC atau ke admin).'),
        ('Sudah PIC tapi tombol tetap tidak aktif', 'Muat ulang halaman. Pastikan Anda '
                                     'login SSO dengan akun yang sama dengan yang didaftarkan.'),
        ('Muncul pesan gagal saat menyimpan', 'Baca pesan yang tampil: bisa berarti sesi '
                                     'habis (login ulang), tidak punya hak edit, atau ada isian '
                                     'yang tidak valid (misalnya persen di luar 0–100). '
                                     'Perbaiki isian lalu simpan lagi.'),
        ('Gagal mengunggah berkas', 'Pastikan ukuran berkas tidak lebih dari 25 MB '
                                    'dan jenis berkasnya sesuai (foto hanya untuk Galeri).'),
        ('Angka uang tampil aneh', 'Tulis angka tanpa titik/koma (contoh: 400000000).'),
        ('Data hilang/tidak tersimpan', 'Pastikan menekan "Simpan" dan menunggu '
                                        'tulisan "tersimpan" muncul. Ingat: tiap bagian punya tombol Simpan sendiri.'),
        ('Persen kelengkapan belum 100%', 'Buka menu Ringkasan, lihat daftar "Belum diisi", '
                                          'lalu klik nama bagiannya untuk langsung mengisi.'),
        ('CCTV berhasil dites VLC tapi di Tengok offline', 'Kabari admin. Pastikan URL yang dikirim sama '
                                     'persis dengan yang dites, dan kamera masih menyala serta terhubung internet.'),
        ('Tes VLC gagal dari paket data', 'Kamera belum bisa diakses dari internet. Pastikan memakai alamat '
                                     'publik (bukan 192.168.x.x / 10.x.x.x) dan port sudah dibuka. Hubungi tim IT proyek.'),
        ('Kolom tidak bisa diketik, ada tulisan "diisi otomatis dari Laporan Bulanan"', 'Itu normal. Angkanya mengikuti laporan bulanan terbaru. '
                                     'Klik tombol "Buka Laporan Bulanan" dan ubah di sana.'),
        ('Peringatan oranye saat mengisi laporan', 'Angka tampak janggal (biasanya salah satuan). Periksa terjemahan "Rp ... M" '
                                     'di bawah kolom. Bila angka sudah benar, tetap bisa disimpan setelah konfirmasi.'),
        ('Simpan Rencana Tahunan ditolak', 'Satu baris harus lengkap 12 bulan (atau kosong semua), dan nilai kumulatif '
                                     'tidak boleh turun (kecuali EBITDA dan Laba Bersih). Baca pesan yang muncul.'),
        ('Kurva S atau kartu laporan tidak muncul di peta', 'Pastikan Laporan Bulanan (dan Rencana Tahunan untuk garis rencana) sudah tersimpan, '
                                     'dan nilai kontrak sudah terisi. Muat ulang halaman peta.'),
        ('Masih bingung', 'Hubungi admin atau tim IT. Lebih baik bertanya daripada '
                          'salah isi.'),
    ], col1='Masalah'))

    doc.build(E, onFirstPage=on_cover, onLaterPages=on_page)
    print('PDF dibuat:', OUT)


if __name__ == '__main__':
    build()
