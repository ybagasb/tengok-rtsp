# -*- coding: utf-8 -*-
"""
Menghasilkan PDF Panduan Pengguna (User Guide) Tengok — versi RAMAH PENGGUNA.

Ditujukan untuk petugas proyek yang mengisi data (BUKAN orang teknis/IT).
Bahasa dibuat sederhana, langkah demi langkah, tanpa jargon.

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
GREEN_DK = colors.HexColor('#047857')

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
                    fontSize=12, textColor=NAVY, spaceBefore=9, spaceAfter=3, leading=16)
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
    t = Table(data, colWidths=[46 * mm, 118 * mm])
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
        'untuk mengisi data proyek — cukup ikuti langkah-langkah bergambar di dalamnya. '
        'Isi yang Anda tahu saja; kolom yang belum ada datanya boleh dikosongkan dan '
        'diisi kemudian.',
        'Untuk Siapa Panduan Ini?', BG_BLUE, colors.HexColor('#3b82f6'), colors.HexColor('#1d4ed8')))
    E.append(Spacer(1, 6 * mm))
    E.append(Paragraph('Edisi ' + '2026' + ' · Dokumen Internal', BODY_C))
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
        'yang menjadi tanggung jawab Anda melalui tautan/spreadsheet yang dibagikan admin.',
        'Admin akan <b>mendaftarkan Anda sebagai PIC</b> proyek tersebut.',
        'Setelah terdaftar, <b>muat ulang</b> halaman — tombol Edit akan aktif pada '
        'proyek Anda, dan Anda bisa mulai mengisi data.',
    ]))
    E.append(callout(
        'Belum didaftarkan sebagai PIC? Hubungi admin/tim IT Anda dan sampaikan '
        '<b>username SSO</b> serta <b>nama proyek</b> yang Anda tangani. Ini syarat '
        'wajib sebelum bisa mengedit.', 'Butuh Akses Edit'))

    # ══ 2. CARA MASUK & MEMBUKA PROYEK ═══════════════════════════════════════
    E.append(Paragraph('Langkah 1 — Masuk & Membuka Proyek Anda', H2))
    E.append(numbered([
        'Buka aplikasi Tengok di browser (Chrome/Edge).',
        'Pilih <b>masuk dengan akun kantor (SSO)</b> dan selesaikan proses login.',
        'Setelah masuk, pilih <b>Divisi</b> (Divisi 1, 2, atau 3), lalu pilih '
        '<b>jenis proyek</b> (kategori).',
        'Akan tampil <b>peta</b>. Klik <b>titik/penanda</b> lokasi proyek Anda.',
        'Pada panel yang muncul, klik tombol <b>"Detail"</b> di pojok kanan atas.',
        'Anda sekarang berada di <b>halaman proyek</b>. Di sinilah semua data diisi.',
    ]))
    E.append(callout(
        'Tombol <b>"Edit"</b> / <b>"Unggah"</b> tidak muncul? Dua kemungkinan: '
        '(1) Anda belum masuk dengan akun kantor (SSO) — keluar lalu masuk lagi lewat SSO; '
        'atau (2) Anda <b>belum terdaftar sebagai PIC</b> proyek itu — lihat bagian '
        '"Kenapa Saya Tidak Bisa Mengedit?" di atas.', 'Kalau Tombol Edit Tidak Ada'))

    # ══ 3. CARA MENGISI (POLA UMUM) ══════════════════════════════════════════
    E.append(Paragraph('Langkah 2 — Pola Mengisi (Sama di Semua Bagian)', H2))
    E.append(numbered([
        'Di sisi kiri ada daftar menu. Pilih bagian yang mau diisi '
        '(misalnya "Finansial" atau "Milestone").',
        'Klik tombol <b>"Edit"</b> (pensil) di kanan atas bagian itu.',
        'Isi kolom yang tersedia. Untuk daftar (seperti tahun anggaran atau '
        'item pengadaan), gunakan tombol <b>"Tambah"</b> untuk menambah baris, '
        'dan ikon <b>tempat sampah</b> untuk menghapus baris.',
        'Klik <b>"Simpan"</b>. Muncul tulisan "tersimpan" → berarti berhasil.',
        'Kalau salah/ingin batal, klik <b>"Batal"</b> sebelum menyimpan.',
    ]))
    E.append(callout(
        'Untuk kolom <b>uang</b>, ketik angkanya saja tanpa titik atau koma. '
        'Contoh: untuk Rp 400 juta, ketik <b>400000000</b>. Aplikasi akan '
        'merapikan tampilannya sendiri.', 'Cara Menulis Angka Uang'))

    E.append(PageBreak())

    # ══ 4. PENJELASAN TIAP BAGIAN ════════════════════════════════════════════
    E.append(Paragraph('Penjelasan Tiap Bagian', H2))
    E.append(Paragraph('Berikut arti tiap bagian dengan bahasa sehari-hari. '
                       'Isi yang relevan dengan proyek Anda.', BODY))

    E.append(Paragraph('Informasi Proyek', H3))
    E.append(Paragraph('Keterangan dasar proyek: siapa pemberi kerja, siapa pengawas, '
                       'siapa pelaksana, tanggal mulai & selesai, dan nama + nomor HP '
                       'penanggung jawab (PIC). Isi apa adanya.', BODY))

    E.append(Paragraph('Ikhtiar (CPI / SPI)', H3))
    E.append(Paragraph('Dua angka nilai kinerja proyek. Biasanya didapat dari laporan '
                       'EVA. Kalau Anda punya angkanya, isi; kalau tidak, kosongkan.', BODY))
    E.append(field_table([
        ('CPI', 'Nilai kinerja biaya. Contoh: 1,02. Angka 1 ke atas = hemat/efisien; '
                'di bawah 1 = boros. Isi sesuai laporan.'),
        ('SPI', 'Nilai kinerja waktu. Contoh: 0,98. Angka 1 ke atas = sesuai/lebih cepat; '
                'di bawah 1 = terlambat. Isi sesuai laporan.'),
    ], col1='Kolom'))

    E.append(Paragraph('Finansial (Keuangan)', H3))
    E.append(field_table([
        ('Cash In', 'Total uang yang sudah masuk/diterima proyek.'),
        ('Cash Out', 'Total uang yang sudah keluar/dibelanjakan.'),
        ('Saldo Kas', 'Sisa kas. Boleh dikosongkan — dihitung otomatis dari '
                      'Cash In dikurangi Cash Out.'),
        ('Saldo Hutang', 'Total hutang proyek saat ini.'),
        ('BAD', 'Bagian dari hutang (sesuai laporan cashflow). Isi kalau ada angkanya.'),
        ('Piutang', 'Uang yang masih ditunggu/belum dibayar ke proyek.'),
        ('CCC', 'Lama perputaran kas, dihitung dalam HARI. Contoh: 120. '
                'Kalau lebih dari 90 hari, aplikasi menandainya merah (perlu perhatian).'),
        ('Hasil Usaha', 'Pendapatan dan biaya proyek. Keuntungannya dihitung otomatis.'),
        ('Kinerja Operasi (PU / BK / LK)', 'PU = pendapatan usaha, BK = beban/biaya '
                                           'konstruksi. LK (laba kotor) dihitung otomatis = PU - BK.'),
        ('Penyerapan Anggaran (DIPA)', 'Rincian anggaran per tahun: rencana vs realisasi. '
                                       'Tekan "Tambah Tahun" untuk menambah baris.'),
    ], col1='Kolom'))
    E.append(tipbox('Istilah seperti CPI, SPI, BAD, CCC biasanya ada di laporan bulanan '
                    'proyek. Tinggal salin angkanya ke kolom yang sesuai. Tidak perlu '
                    'menghitung sendiri.', 'Dari Mana Angkanya?'))

    E.append(Paragraph('Milestone (Tahapan Pekerjaan)', H3))
    E.append(Paragraph('Daftar tahapan besar proyek beserta kemajuannya. Tekan "Tambah", '
                       'tulis nama tahapan, lalu isi persen kemajuannya (0–100). '
                       'Kemajuan total dihitung otomatis.', BODY))

    E.append(Paragraph('Sumber Daya', H3))
    E.append(Paragraph('Daftar alat, tenaga kerja, atau material di proyek. Tiap baris: '
                       'nama, kelompok (Alat Berat / Tenaga Kerja / Material), jumlah, '
                       'dan satuan (Unit / Orang / m³).', BODY))

    E.append(Paragraph('Monitoring Pengadaan', H3))
    E.append(Paragraph('Daftar barang/pengadaan penting (major item) beserta persen '
                       'progresnya. Cukup isi nama barang dan persentasenya. '
                       'Ada di bagian bawah menu "Sumber Daya".', BODY))

    E.append(Paragraph('Change Management (Perubahan & Legal)', H3))
    E.append(Paragraph('Catatan perubahan pada proyek (harga, lingkup pekerjaan, klaim, '
                       'atau masalah hukum). Tiap catatan isi:', BODY))
    E.append(field_table([
        ('Judul', 'Nama singkat perubahannya.'),
        ('Jenis', 'Pilih salah satu: Perubahan Harga, Perubahan Lingkup, Klaim, '
                  'Legal Issue, atau Lain-lain.'),
        ('Deskripsi', 'Cerita singkat: apa yang berubah dan kenapa.'),
        ('Dampak', 'Akibatnya ke proyek (biaya bertambah? waktu mundur? dll).'),
        ('Mitigasi', 'Rencana/langkah untuk menangani dampak itu.'),
        ('Nilai, Tanggal, PIC, Status', 'Lengkapi bila ada. Status: Usulan / Disetujui / Ditolak.'),
    ], col1='Kolom'))

    E.append(Paragraph('Isu & Kendala', H3))
    E.append(Paragraph('Masalah yang sedang dihadapi proyek, penyebab, dan rencana '
                       'penanganannya. Kendala juga bisa dipindahkan menjadi catatan '
                       '"Change Management" lewat satu tombol.', BODY))

    E.append(Paragraph('Kontrak, Progres, Lokasi', H3))
    E.append(Paragraph('Nomor & nilai kontrak, kemajuan fisik (rencana vs kenyataan), '
                       'dan titik lokasi di peta. Isi seperlunya.', BODY))

    E.append(Paragraph('Galeri & Dokumen', H3))
    E.append(bullets([
        '<b>Galeri</b>: tekan "Unggah Foto" untuk menambah foto proyek (JPG/PNG).',
        '<b>Dokumen</b>: tekan "Unggah Dokumen" untuk berkas (PDF, Word, Excel, '
        'PowerPoint, dll).',
        'Ukuran tiap berkas maksimal <b>25 MB</b>.',
        'Saat menghapus, akan ada konfirmasi dulu — jadi aman.',
    ]))

    # ══ 5. KALAU ADA MASALAH ═════════════════════════════════════════════════
    E.append(Paragraph('Kalau Ada Masalah', H2))
    E.append(field_table([
        ('Tombol Edit tidak muncul / tidak bisa edit', 'Dua sebab: belum login SSO '
                                     '(keluar & masuk lagi lewat SSO), ATAU belum terdaftar '
                                     'sebagai PIC proyek itu (daftarkan username SSO + nama '
                                     'proyek ke admin).'),
        ('Sudah PIC tapi tombol tetap tidak aktif', 'Muat ulang halaman. Pastikan Anda '
                                     'login SSO dengan akun yang sama dengan yang didaftarkan.'),
        ('Gagal mengunggah berkas', 'Pastikan ukuran berkas tidak lebih dari 25 MB.'),
        ('Angka uang tampil aneh', 'Tulis angka tanpa titik/koma (contoh: 400000000).'),
        ('Data hilang/tidak tersimpan', 'Pastikan menekan "Simpan" dan menunggu '
                                        'tulisan "tersimpan" muncul.'),
        ('Masih bingung', 'Hubungi admin atau tim IT. Lebih baik bertanya daripada '
                          'salah isi.'),
    ], col1='Masalah'))
    E.append(Spacer(1, 5 * mm))
    E.append(hr())
    E.append(Paragraph('Dokumen panduan internal — PT Brantas Abipraya (Persero). '
                       'Tampilan aplikasi dapat sedikit berbeda seiring pembaruan.', SMALL))

    doc.build(E, onFirstPage=on_cover, onLaterPages=on_page)
    print('PDF dibuat:', OUT)


if __name__ == '__main__':
    build()
