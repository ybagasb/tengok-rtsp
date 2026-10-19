# -*- coding: utf-8 -*-
"""
Menghasilkan PDF Panduan Pengguna (User Guide) Tengok — versi RAMAH PENGGUNA.

Ditujukan untuk petugas proyek yang mengisi data (BUKAN orang teknis/IT).
Bahasa dibuat sederhana, langkah demi langkah, tanpa jargon.

Struktur menu di panduan ini mengikuti halaman /project/[id]:
  Ringkasan · CPI / SPI · Cash & Keuangan · Operasi · Change Management ·
  Isu & Kendala · Lainnya (Informasi, Lokasi, Kontrak, Progres, Galeri, Dokumen)

Jalankan: python scripts/make_user_guide.py
Output  : public/Panduan-Input-Detail-Proyek.pdf
"""
import os
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
        ('Ringkasan', 'Gambaran umum proyek + <b>indikator kelengkapan data</b>. '
                      'Mulailah dari sini untuk tahu bagian mana yang belum diisi.'),
        ('CPI / SPI', 'Dua angka nilai kinerja (biaya &amp; jadwal) dari laporan EVA.'),
        ('Cash &amp; Keuangan', 'Tagihan, kas masuk/keluar, hutang, piutang, CCC, hasil usaha, '
                                'dan penyerapan anggaran (DIPA).'),
        ('Operasi', 'Kinerja Operasi (PU/BK/LK), <b>Progress Mingguan</b>, Milestone, '
                    'Sumber Daya, dan Monitoring Pengadaan.'),
        ('Change Management', 'Catatan perubahan harga/lingkup, klaim, dan masalah hukum.'),
        ('Isu &amp; Kendala', 'Isu strategis dan kendala di lapangan beserta penanganannya.'),
        ('Lainnya', 'Informasi, Lokasi, Kontrak, Progres, dan Galeri.'),
    ], col1='Menu'))
    E.append(Spacer(1, 3 * mm))

    E.append(Paragraph('Cara Memakai Indikator Kelengkapan (di Menu Ringkasan)', H3))
    E.append(Paragraph(
        'Di bagian atas menu <b>Ringkasan</b> ada kartu <b>"Kelengkapan Data Proyek"</b> '
        'berisi persen kelengkapan dan daftar bagian yang <b>belum diisi</b>. '
        'Klik nama bagian tersebut — Anda langsung dibawa ke menu yang harus diisi. '
        'Hijau = hampir lengkap, kuning = setengah jalan, merah = masih banyak yang kosong.', BODY))

    # ══ 4. CARA MENGISI (POLA UMUM) ══════════════════════════════════════════
    E.append(Paragraph('Langkah 2 — Pola Mengisi (Sama di Semua Bagian)', H2))
    E.append(numbered([
        'Pilih menu di sisi kiri (misalnya "Cash &amp; Keuangan" atau "Operasi").',
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

    # ══ 5. PENJELASAN TIAP MENU ══════════════════════════════════════════════
    E.append(Paragraph('Penjelasan Tiap Menu', H2))
    E.append(Paragraph('Berikut arti tiap bagian dengan bahasa sehari-hari. '
                       'Isi yang relevan dengan proyek Anda.', BODY))

    # ── CPI / SPI ──
    E.append(Paragraph('Menu CPI / SPI (Ikhtiar)', H3))
    E.append(Paragraph('Dua angka nilai kinerja proyek. Biasanya didapat dari laporan '
                       'EVA. Kalau Anda punya angkanya, isi; kalau tidak, kosongkan. '
                       'Setelah disimpan, aplikasi menampilkan status otomatis '
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
        ('Saldo Hutang', 'Total hutang proyek saat ini.'),
        ('BAD', 'Beban yang Akan Dibayar — bagian dari hutang (sesuai laporan cashflow). '
                'Isi kalau ada angkanya.'),
        ('Piutang', 'Uang yang masih ditunggu/belum dibayar ke proyek.'),
        ('CCC', 'Lama perputaran kas, dihitung dalam HARI. Contoh: 120. '
                'Kalau lebih dari 90 hari, aplikasi menandainya merah (perlu perhatian).'),
        ('Beban Konstruksi', 'Total beban/biaya konstruksi proyek.'),
        ('Hasil Usaha', 'Isi <b>Pendapatan Usaha</b> dan <b>Biaya/HPP</b>. '
                        'Laba (atau rugi) dan margin dihitung otomatis.'),
        ('Progress Keuangan (DIPA)', 'Rincian anggaran per tahun: <b>Pagu/Rencana</b> vs <b>Realisasi</b>. '
                                     'Tekan "Tambah Tahun" untuk menambah baris, "Hapus tahun ini" untuk menghapus.'),
        ('Progress Belum Ditagihkan', 'Nilai pekerjaan yang sudah berjalan tetapi belum ditagihkan. '
                                      'Ada di dalam bagian Progress Keuangan.'),
    ], col1='Kolom'))
    E.append(Spacer(1, 2 * mm))
    E.append(tipbox('Istilah seperti CPI, SPI, BAD, CCC biasanya ada di laporan bulanan '
                    'proyek. Tinggal salin angkanya ke kolom yang sesuai. Tidak perlu '
                    'menghitung sendiri.', 'Dari Mana Angkanya?'))

    # ── Operasi ──
    E.append(Paragraph('Menu Operasi', H3))
    E.append(Paragraph('Menu ini punya <b>lima bagian</b>, masing-masing dengan tombol Edit sendiri:', BODY))

    E.append(Paragraph('1) Kinerja Operasi (PU / BK / LK)', H3))
    E.append(field_table([
        ('PU', 'Pendapatan Usaha dari sisi operasi proyek.'),
        ('BK', 'Beban Konstruksi (biaya konstruksi operasi).'),
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
                    'otomatis). Di sini juga ada <b>Lingkup Pekerjaan</b> — tekan "Tambah" '
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
        ('Masih bingung', 'Hubungi admin atau tim IT. Lebih baik bertanya daripada '
                          'salah isi.'),
    ], col1='Masalah'))
    E.append(Paragraph(f'Dokumen panduan internal — PT Brantas Abipraya (Persero). Edisi {EDISI}. '
                       'Tampilan aplikasi dapat sedikit berbeda seiring pembaruan.', SMALL))

    doc.build(E, onFirstPage=on_cover, onLaterPages=on_page)
    print('PDF dibuat:', OUT)


if __name__ == '__main__':
    build()
