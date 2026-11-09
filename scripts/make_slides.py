# -*- coding: utf-8 -*-
"""
Slide presentasi Tengok PMIS (6 slide) -> PPTX + PDF dari SATU sumber konten.

Isi: syarat edit & peran admin (penetapan PIC), 16 dimensi data & tempat mengisi,
dashboard model RRB, rekap adopsi JIAT (checklist), rekap proyek Divisi 2 lain yang sudah mengisi.

Data adopsi : node --env-file=.env.local scripts/adopsi_snapshot.mjs   (-> scripts/slides-data/adopsi.json)
Gambar      : scripts/guide-img/*.png  (node scripts/guide_shots.mjs)
Jalankan    : python scripts/make_slides.py
Output      : public/Tengok-PMIS-Dimensi-Data-PIC.pptx dan .pdf
"""
import json, math, os, sys
from PIL import Image

# ── Palet (tema terang Abipraya) ─────────────────────────────────────────────
NAVY = '0F172A'; SLATE = '334155'; SLATE_L = '64748B'; AMBER = 'F59E0B'; AMBER_DK = 'B45309'
BLUE = '2563EB'; GREEN = '047857'; ROSE = 'E11D48'; WHITE = 'FFFFFF'
BG_SOFT = 'F8FAFC'; BG_AMBER = 'FFFBEB'; BG_BLUE = 'EFF6FF'; BG_GREEN = 'ECFDF5'; BG_ROSE = 'FFF1F2'; LINE = 'E2E8F0'

W, H = 13.333, 7.5
OUT_BASE = 'public/Tengok-PMIS-Dimensi-Data-PIC'
IMG = 'scripts/guide-img'
LOGO_D = 'public/main-danantara-indonesia-horizontal-logo.png'
LOGO_A = 'public/LOGO_ABIPRAYA.png'
DATA = 'scripts/slides-data/adopsi.json'
HEADER_H = 0.92
CY = HEADER_H + 0.06 + 0.22


# ═════════════════════════ BACKEND PPTX ═════════════════════════
class PptxBackend:
    FONT = 'Calibri'

    def __init__(self):
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
        from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
        self.I, self.Pt, self.RGB = Inches, Pt, RGBColor
        self.SH, self.CN, self.AL, self.AN = MSO_SHAPE, MSO_CONNECTOR, PP_ALIGN, MSO_ANCHOR
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = Inches(W), Inches(H)
        self.slide = None

    def new(self):
        self.slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])

    def _col(self, hx):
        return self.RGB.from_string(hx)

    def rect(self, x, y, w, h, fill=None, stroke=None, sw=0.75, radius=0):
        shp = self.SH.ROUNDED_RECTANGLE if radius else self.SH.RECTANGLE
        sp = self.slide.shapes.add_shape(shp, self.I(x), self.I(y), self.I(w), self.I(h))
        sp.shadow.inherit = False
        if fill:
            sp.fill.solid(); sp.fill.fore_color.rgb = self._col(fill)
        else:
            sp.fill.background()
        if stroke:
            sp.line.color.rgb = self._col(stroke); sp.line.width = self.Pt(sw)
        else:
            sp.line.fill.background()
        if radius:
            try: sp.adjustments[0] = min(0.5, radius / min(w, h))
            except Exception: pass

    def oval(self, cx, cy, r, fill):
        sp = self.slide.shapes.add_shape(self.SH.OVAL, self.I(cx - r), self.I(cy - r), self.I(2 * r), self.I(2 * r))
        sp.shadow.inherit = False
        sp.fill.solid(); sp.fill.fore_color.rgb = self._col(fill); sp.line.fill.background()

    def line(self, x1, y1, x2, y2, color, w=1.5):
        c = self.slide.shapes.add_connector(self.CN.STRAIGHT, self.I(x1), self.I(y1), self.I(x2), self.I(y2))
        c.line.color.rgb = self._col(color); c.line.width = self.Pt(w)

    def image(self, path, x, y, w, h):
        self.slide.shapes.add_picture(path, self.I(x), self.I(y), self.I(w), self.I(h))

    def text(self, x, y, w, h, runs, size=12, color=SLATE, bold=False, italic=False, align='left', anchor='top'):
        tb = self.slide.shapes.add_textbox(self.I(x), self.I(y), self.I(w), self.I(h))
        tf = tb.text_frame; tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = {'top': self.AN.TOP, 'middle': self.AN.MIDDLE, 'bottom': self.AN.BOTTOM}[anchor]
        p = tf.paragraphs[0]
        p.alignment = {'left': self.AL.LEFT, 'center': self.AL.CENTER, 'right': self.AL.RIGHT}[align]
        p.line_spacing = 1.0
        for t, ov in runs_of(runs):
            r = p.add_run(); r.text = t
            r.font.name = self.FONT; r.font.size = self.Pt(ov.get('size', size))
            r.font.bold = ov.get('bold', bold); r.font.italic = ov.get('italic', italic)
            r.font.color.rgb = self._col(ov.get('color', color))

    def save(self):
        self.prs.save(OUT_BASE + '.pptx')
        return OUT_BASE + '.pptx'


# ═════════════════════════ BACKEND PDF ═════════════════════════
class PdfBackend:
    def __init__(self):
        from reportlab.pdfgen import canvas
        from reportlab.lib import colors
        self.colors = colors
        self.c = canvas.Canvas(OUT_BASE + '.pdf', pagesize=(W * 72, H * 72))
        self.c.setTitle('Tengok PMIS - Dimensi Data Proyek & Adopsi PIC')
        self.started = False

    def new(self):
        if self.started: self.c.showPage()
        self.started = True

    def _col(self, hx): return self.colors.HexColor('#' + hx)
    def _y(self, y, h=0): return (H - y - h) * 72

    def rect(self, x, y, w, h, fill=None, stroke=None, sw=0.75, radius=0):
        c = self.c; c.saveState()
        if fill: c.setFillColor(self._col(fill))
        if stroke: c.setStrokeColor(self._col(stroke)); c.setLineWidth(sw)
        if radius: c.roundRect(x * 72, self._y(y, h), w * 72, h * 72, radius * 72, stroke=1 if stroke else 0, fill=1 if fill else 0)
        else: c.rect(x * 72, self._y(y, h), w * 72, h * 72, stroke=1 if stroke else 0, fill=1 if fill else 0)
        c.restoreState()

    def oval(self, cx, cy, r, fill):
        self.c.saveState(); self.c.setFillColor(self._col(fill))
        self.c.circle(cx * 72, self._y(cy), r * 72, stroke=0, fill=1); self.c.restoreState()

    def line(self, x1, y1, x2, y2, color, w=1.5):
        self.c.saveState(); self.c.setStrokeColor(self._col(color)); self.c.setLineWidth(w)
        self.c.setLineCap(1)
        self.c.line(x1 * 72, self._y(y1), x2 * 72, self._y(y2)); self.c.restoreState()

    def image(self, path, x, y, w, h):
        self.c.drawImage(path, x * 72, self._y(y, h), w * 72, h * 72, mask='auto')

    def text(self, x, y, w, h, runs, size=12, color=SLATE, bold=False, italic=False, align='left', anchor='top'):
        c = self.c
        def font(ov):
            b = ov.get('bold', bold); i = ov.get('italic', italic)
            return 'Helvetica-BoldOblique' if b and i else 'Helvetica-Bold' if b else 'Helvetica-Oblique' if i else 'Helvetica'
        toks = []
        for t, ov in runs_of(runs):
            for wd in t.split(' '):
                if wd != '': toks.append((wd, font(ov), ov.get('size', size), ov.get('color', color)))
        maxw = w * 72; lines = []; cur = []; curw = 0
        for wd, f, sz, col in toks:
            ww = c.stringWidth(wd, f, sz); sp = c.stringWidth(' ', f, sz) if cur else 0
            if cur and curw + sp + ww > maxw:
                lines.append(cur); cur = [(wd, f, sz, col, ww)]; curw = ww
            else:
                cur.append((wd, f, sz, col, ww)); curw += sp + ww
        if cur: lines.append(cur)
        lead = size * 1.18
        total = len(lines) * lead
        y0 = {'top': 0, 'middle': (h * 72 - total) / 2, 'bottom': h * 72 - total}[anchor]
        base = self._y(y) - y0 - size * 0.86
        for ln in lines:
            lw = sum(t[4] for t in ln) + sum(c.stringWidth(' ', t[1], t[2]) for t in ln[1:])
            sx = x * 72 + {'left': 0, 'center': (maxw - lw) / 2, 'right': maxw - lw}[align]
            for k, (wd, f, sz, col, ww) in enumerate(ln):
                if k: sx += c.stringWidth(' ', f, sz)
                c.setFont(f, sz); c.setFillColor(self._col(col)); c.drawString(sx, base, wd); sx += ww
            base -= lead

    def save(self):
        self.c.showPage(); self.c.save()
        return OUT_BASE + '.pdf'


# ═════════════════════════ HELPER BERSAMA ═════════════════════════
def runs_of(c): return [(c, {})] if isinstance(c, str) else c
def plain(c): return ''.join(t for t, _ in runs_of(c))
def est_lines(c, size, w): return max(1, math.ceil(len(plain(c)) / max(1, int(w * 72 / (size * 0.5)))))
def clip(s, n): return s if len(s) <= n else s[:n - 1].rstrip() + '...'


def fit_image(B, path, x, y, w, h, align='center', valign='top', frame=True):
    if not os.path.exists(path):
        print('  (lewati, gambar tak ada):', path); return (x, y, 0, 0)
    iw, ih = Image.open(path).size
    if iw / ih > w / h: nw, nh = w, w * ih / iw
    else: nh, nw = h, h * iw / ih
    nx = x + {'left': 0, 'center': (w - nw) / 2, 'right': w - nw}[align]
    ny = y + {'top': 0, 'middle': (h - nh) / 2, 'bottom': h - nh}[valign]
    if frame: B.rect(nx - 0.012, ny - 0.012, nw + 0.024, nh + 0.024, WHITE, LINE, 1)
    B.image(path, nx, ny, nw, nh)
    return (nx, ny, nw, nh)


def logos(B, size_d=0.42, size_a=0.5, top=None):
    base = (HEADER_H - size_d) / 2 if top is None else top
    if os.path.exists(LOGO_D):
        iw, ih = Image.open(LOGO_D).size
        B.image(LOGO_D, 0.33, base, size_d * iw / ih, size_d)
    if os.path.exists(LOGO_A):
        iw, ih = Image.open(LOGO_A).size
        ba = (HEADER_H - size_a) / 2 if top is None else top
        B.image(LOGO_A, W - 0.33 - size_a * iw / ih, ba, size_a * iw / ih, size_a)


PAGE = {'n': 0}

def content_slide(B, kicker, title):
    B.new(); PAGE['n'] += 1
    B.rect(0, 0, W, H, WHITE)
    B.rect(0, 0, W, HEADER_H, WHITE); B.rect(0, HEADER_H, W, 0.06, AMBER)
    logos(B)
    B.text(2.6, 0.12, W - 5.2, 0.28, kicker.upper(), 10.5, AMBER_DK, True, align='center', anchor='middle')
    B.text(2.6, 0.4, W - 5.2, 0.4, title, 19, NAVY, True, align='center', anchor='middle')
    B.rect(0, H - 0.34, W, 0.34, BG_SOFT)
    B.text(0.33, H - 0.34, 8, 0.34, 'Tengok - Project Management Information System · PT Brantas Abipraya (Persero)', 9, SLATE_L, anchor='middle')
    B.text(W - 1.4, H - 0.34, 1.07, 0.34, str(PAGE['n']), 9, SLATE_L, align='right', anchor='middle')


def box_title(B, x, y, w, title, bg):
    B.rect(x, y, w, 0.42, bg, None, 0, 0.08); B.rect(x, y + 0.2, w, 0.22, bg)
    B.text(x + 0.18, y, w - 0.36, 0.42, title, 13, WHITE, True, anchor='middle')


def bullet_box(B, x, y, w, h, title, items, bg=BLUE, accent=AMBER, size=12):
    B.rect(x, y, w, h, BG_SOFT, LINE, 1, 0.08)
    box_title(B, x, y, w, title, bg)
    yy = y + 0.56
    for it in items:
        hh = est_lines(it, size, w - 0.7) * size * 1.22 / 72
        B.oval(x + 0.27, yy + size * 0.62 / 72, 0.045, accent)
        B.text(x + 0.45, yy, w - 0.65, hh, it, size, SLATE)
        yy += hh + 0.1


def table(B, x, y, col_w, head, rows, row_h=0.34, size=10, head_bg=BLUE, head_h=0.36, cell_fn=None):
    cx = x
    for label, cw in zip(head, col_w):
        B.rect(cx, y, cw, head_h, head_bg, WHITE, 0.5)
        B.text(cx + 0.08, y, cw - 0.12, head_h, label, size, WHITE, True, anchor='middle')
        cx += cw
    yy = y + head_h
    for ri, row in enumerate(rows):
        cx = x; bg = WHITE if ri % 2 == 0 else BG_SOFT
        for ci, (val, cw) in enumerate(zip(row, col_w)):
            B.rect(cx, yy, cw, row_h, bg, LINE, 0.5)
            if cell_fn and cell_fn(B, ri, ci, val, cx, yy, cw, row_h):
                pass
            else:
                B.text(cx + 0.08, yy, cw - 0.12, row_h, val, size, SLATE, anchor='middle')
            cx += cw
        yy += row_h
    return yy


def checkbox(B, x, y, s, checked):
    if checked:
        B.rect(x, y, s, s, GREEN, GREEN, 1, 0.03)
        B.line(x + 0.22 * s, y + 0.54 * s, x + 0.43 * s, y + 0.76 * s, WHITE, 1.6)
        B.line(x + 0.43 * s, y + 0.76 * s, x + 0.8 * s, y + 0.26 * s, WHITE, 1.6)
    else:
        B.rect(x, y, s, s, WHITE, SLATE_L, 1.25, 0.03)


def data_note(B, d):
    """Note kecil di dasar slide: kapan data diambil dari database."""
    B.text(0.5, H - 0.34 - 0.27, W - 1.0, 0.22,
           f"Data per {d['tanggalLabel']}, pukul {d['jamLabel']} WIB (sumber: database Tengok).", 9.5, SLATE_L, italic=True)


def stat_card(B, x, y, w, h, label, value, sub, tone):
    fg, bg = {'green': (GREEN, BG_GREEN), 'blue': (BLUE, BG_BLUE), 'amber': (AMBER_DK, BG_AMBER), 'rose': (ROSE, BG_ROSE)}[tone]
    B.rect(x, y, w, h, bg, LINE, 1, 0.1)
    B.text(x + 0.18, y + 0.09, w - 0.3, 0.2, label.upper(), 9.5, SLATE_L, True)
    B.text(x + 0.18, y + 0.3, w - 0.3, 0.4, value, 24, fg, True, anchor='middle')
    B.text(x + 0.18, y + h - 0.27, w - 0.3, 0.2, sub, 10, SLATE)


# ═════════════════════════ ISI SLIDE ═════════════════════════
def load_data():
    if not os.path.exists(DATA):
        sys.exit('Data adopsi belum ada. Jalankan: node --env-file=.env.local scripts/adopsi_snapshot.mjs')
    with open(DATA, encoding='utf-8') as f:
        return json.load(f)


def slide_cover(B, d):
    B.new()
    B.rect(0, 0, W, H, WHITE); B.rect(0, 0, W, 0.16, AMBER); B.rect(0, H - 0.16, W, 0.16, AMBER)
    B.rect(1.1, 2.1, W - 2.2, 3.0, BG_BLUE, LINE, 1, 0.06)
    logos(B, 0.6, 0.75, top=0.5)
    B.text(0.9, 2.45, W - 1.8, 0.9, 'Dimensi Data Proyek & Adopsi PIC', 40, NAVY, True, align='center', anchor='middle')
    B.text(0.9, 3.5, W - 1.8, 0.5, 'Aplikasi Tengok - Project Management Information System (PMIS)', 18, AMBER_DK, True, align='center', anchor='middle')
    B.text(2.4, 4.2, W - 4.8, 0.7, 'Apa yang diisi PIC, di mana mengisinya, peran admin menetapkan PIC, dan rekap adopsi PL Irigasi & JIAT', 14, SLATE, align='center', anchor='top')
    B.text(0.9, H - 0.95, W - 1.8, 0.4, f"PT Brantas Abipraya (Persero) · Dokumen Internal · Data per {d['tanggalLabel']}", 11, SLATE_L, align='center', anchor='middle')


def slide_syarat(B, d):
    content_slide(B, 'Peran PIC & Admin', 'Siapa yang Bisa Mengisi Data?')
    B.text(0.5, CY, 6.1, 0.55, [('Melihat', {'bold': True, 'color': NAVY}), (' cukup PIN. ', {}), ('Mengisi / mengedit', {'bold': True, 'color': AMBER_DK}),
                                 (' butuh login SSO dan status PIC pada proyek tersebut.', {})], 14)
    steps = [('1', 'PIC login SSO minimal sekali', 'Agar akun PIC terbaca sistem.'),
             ('2', 'Admin menetapkan PIC per proyek', 'Super-admin: buka proyek, tab Informasi, panel "PIC Proyek", tambahkan user.'),
             ('3', 'PIC muat ulang halaman', 'Tombol Edit dan Unggah aktif, hanya di proyek yang ditanganinya.')]
    yy = CY + 0.7
    for n, t1, t2 in steps:
        B.rect(0.5, yy, 6.1, 0.95, BG_BLUE, BLUE, 1, 0.09)
        B.oval(0.92, yy + 0.475, 0.26, BLUE)
        B.text(0.66, yy + 0.2, 0.52, 0.55, n, 18, WHITE, True, align='center', anchor='middle')
        B.text(1.4, yy + 0.12, 5.1, 0.3, t1, 13.5, NAVY, True)
        B.text(1.4, yy + 0.45, 5.1, 0.45, t2, 11, SLATE)
        yy += 1.08
    nx, ny, nw, nh = fit_image(B, f'{IMG}/23-informasi.png', 6.9, CY + 0.05, 5.93, 3.8)
    B.text(6.9, ny + nh + 0.06, 5.93, 0.25, 'Panel "PIC Proyek" ada di tab Informasi (khusus super-admin).', 10, SLATE_L, italic=True, align='center')
    B.rect(0.5, 5.75, W - 1.0, 0.85, BG_AMBER, AMBER, 1.25, 0.1)
    B.text(0.75, 5.75, W - 1.5, 0.85, [('Inti: ', {'bold': True, 'color': AMBER_DK}), ('tanpa penetapan PIC oleh admin, PIC tidak bisa mengedit data proyeknya. ', {'bold': True}),
                                       ('Server juga menolak tulis dari non-PIC, jadi penetapan PIC harus dilakukan per proyek sebelum pengisian dimulai.', {})], 13, anchor='middle')


DIM_L = [('Informasi', 'Lainnya > Informasi', 'PM/PIC, HP, status, tanggal'),
         ('Kontrak', 'Lainnya > Kontrak', 'Nomor & nilai kontrak'),
         ('Progres fisik', 'Lainnya > Progres', 'Rencana & realisasi %'),
         ('CPI / SPI', 'Ringkasan', 'Otomatis dari laporan'),
         ('Finansial', 'Cash & Keuangan', 'Kas, DIPA, MC Cair'),
         ('Kinerja Operasi', 'Operasi', 'PU & BK (LK otomatis)'),
         ('Progress Mingguan', 'Operasi', 'RA/RI W1-W4'),
         ('Milestone', 'Operasi', 'Tahapan & persen')]
DIM_R = [('Sumber Daya', 'Operasi', 'Alat, SDM, material'),
         ('Monitoring Pengadaan', 'Operasi', 'Item major & persen'),
         ('Change Management', 'Change Management', 'Perubahan, klaim, legal'),
         ('QHSSE', 'QHSSE', '9 dimensi, data bulanan'),
         ('Lokasi', 'Lainnya > Lokasi', 'Footprint bangunan 3D'),
         ('Galeri', 'Lainnya > Galeri', 'Foto proyek'),
         ('Dokumen', 'Lainnya > Dokumen', 'Berkas pendukung'),
         ('Laporan Bulanan', 'Laporan Bulanan', 'Angka rutin tiap bulan')]


def slide_dimensi(B, d):
    content_slide(B, 'Dimensi Data', '16 Dimensi Data yang Diisi PIC dan Tempat Mengisinya')
    B.text(0.5, CY - 0.08, W - 1.0, 0.3, 'Tiap dimensi punya tempat isi dan tombol Simpan sendiri, plus tombol (i) untuk melihat kapan dan siapa yang terakhir mengedit.', 12, SLATE)
    cw = [1.95, 1.85, 2.2]; head = ['Dimensi', 'Di mana', 'Catatan']
    table(B, 0.5, CY + 0.32, cw, head, DIM_L, 0.4, 10.5)
    table(B, 6.83, CY + 0.32, cw, head, DIM_R, 0.4, 10.5)
    y = CY + 0.32 + 0.36 + 8 * 0.4 + 0.25
    bullet_box(B, 0.5, y, 6.05, 1.5, 'Dihitung otomatis (tidak perlu diketik)', [
        'CPI/SPI, kartu finansial, Kurva S: dari Laporan Bulanan',
        'LK = PU - BK; deviasi progres; TRIR & Efisiensi Energi (QHSSE)'], bg=GREEN, accent=GREEN, size=11.5)
    bullet_box(B, 6.78, y, 6.05, 1.5, 'Pelengkap dashboard model RRB (diisi sekali)', [
        'MC Cair, keterangan, cut-off: tab Cash & Keuangan',
        'BL (Beban Langsung): Hasil Usaha di Laporan Bulanan'], bg=AMBER_DK, accent=AMBER, size=11.5)


def slide_dashboard(B, d):
    content_slide(B, 'Dashboard Model RRB', 'Dashboard Rekap Dimensi Data (RRB dan PL Irigasi & JIAT)')
    ix = 0.5; iw = 6.05
    _, _, _, nh1 = fit_image(B, f'{IMG}/33-kategori-kelengkapan.png', ix, CY, iw, 3.4)
    _, _, _, nh2 = fit_image(B, f'{IMG}/35-dashboard-irigasi-jiat.png', 6.78, CY, iw, 3.4)
    cy = CY + max(nh1, nh2) + 0.06
    B.text(ix, cy, iw, 0.45, 'Panel kategori: lencana "n/N data" = proyek yang sudah mengisi dari total proyek kategori. Tombol dashboard ada di samping Masuk.', 10, SLATE_L, italic=True, align='center')
    B.text(6.78, cy, iw, 0.45, 'Dashboard PL Irigasi & JIAT (saat ini JIAT saja): Progress Fisik, Progress Keuangan, Profitabilitas BL / BAU / L-R.', 10, SLATE_L, italic=True, align='center')
    bullet_box(B, 0.5, cy + 0.6, W - 1.0, 1.55, 'Cara kerja', [
        'Angka dashboard diambil dari data proyek yang sudah ada (progres, kontrak, DIPA, laporan bulanan): tidak ada input ganda.',
        'Dashboard RRB (kategori Bencana, per divisi) dibuka lewat tombol Dashboard di menu RRB; Irigasi/DIR belum dimasukkan.'], size=11.5)


def pic_text(pics):
    """Daftar PIC ringkas: bila panjang, nama pertama + jumlah PIC lainnya."""
    joined = ', '.join(pics)
    if len(joined) > 34 and len(pics) > 1:
        return f"{pics[0]} +{len(pics) - 1} lainnya"
    return clip(joined, 40)


def slide_adopsi(B, d):
    j = d['jiat']; ir = d['irigasi']
    content_slide(B, 'Rekap Adopsi', 'Checklist Adopsi PIC - JIAT dan Irigasi (DIR)')
    gap = 0.18; cw = (W - 1.0 - 3 * gap) / 4; y = CY - 0.04
    stat_card(B, 0.5, y, cw, 1.0, 'Proyek JIAT', f"{j['total']} proyek", f"{j['filledCount']} sudah mengisi · {j['total'] - j['filledCount']} belum", 'blue')
    stat_card(B, 0.5 + (cw + gap), y, cw, 1.0, 'Proyek Irigasi (DIR)', f"{ir['total']} proyek", f"{ir['filledCount']} sudah mengisi · {ir['total'] - ir['filledCount']} belum", 'blue')
    stat_card(B, 0.5 + 2 * (cw + gap), y, cw, 1.0, 'PIC terdaftar (JIAT)', f"{j['picCount']}/{j['total']}", f"{j['total'] - j['picCount']} proyek belum ada PIC", 'amber')
    stat_card(B, 0.5 + 3 * (cw + gap), y, cw, 1.0, 'Adopsi lengkap (JIAT)', f"{j['lengkapCount']}/{j['total']}", 'PIC terdaftar dan sudah mengisi', 'green')

    # JIAT: semua proyek. Irigasi/DIR: hanya yang sudah mengisi (supaya muat satu slide).
    items = [('JIAT', r) for r in j['rows']] + [('Irigasi (DIR)', r) for r in ir['rows'] if r['filled']]
    cwid = [0.4, 1.35, 2.55, 3.55, 2.85, 1.63]
    head = ['No', 'Kategori', 'Proyek', 'PIC terdaftar', 'Sudah mengisi data', 'Status']
    rows = [[str(i), cat, r['name'], r, r, r] for i, (cat, r) in enumerate(items, 1)]

    def status(r):
        if r['hasPic'] and r['filled']: return ('Lengkap', GREEN, BG_GREEN)
        if r['hasPic']: return ('Perlu isi data', AMBER_DK, BG_AMBER)
        if r['filled']: return ('Isi, tanpa PIC', AMBER_DK, BG_AMBER)
        return ('Belum ada PIC', ROSE, BG_ROSE)

    def cell(B, ri, ci, val, cx, cy, cwid_, rh):
        s = min(0.17, rh - 0.08)
        if ci == 3:
            checkbox(B, cx + 0.1, cy + (rh - s) / 2, s, val['hasPic'])
            B.text(cx + 0.38, cy, cwid_ - 0.45, rh, pic_text(val['pics']) if val['hasPic'] else '-', 10, SLATE, anchor='middle')
            return True
        if ci == 4:
            checkbox(B, cx + 0.1, cy + (rh - s) / 2, s, val['filled'])
            txt = f"{val['dims']} dimensi · {val['last']}" if val['filled'] else '-'
            B.text(cx + 0.38, cy, cwid_ - 0.45, rh, txt, 10, SLATE, anchor='middle')
            return True
        if ci == 5:
            t, fg, bg = status(val)
            B.rect(cx + 0.06, cy + 0.03, cwid_ - 0.12, rh - 0.06, bg, None, 0, 0.08)
            B.text(cx + 0.06, cy, cwid_ - 0.12, rh, t, 9.5, fg, True, align='center', anchor='middle')
            return True
        if ci == 0:
            B.text(cx, cy, cwid_, rh, val, 10, SLATE_L, align='center', anchor='middle'); return True
        if ci == 1:
            B.text(cx + 0.08, cy, cwid_ - 0.12, rh, val, 10, SLATE, anchor='middle'); return True
        if ci == 2:
            B.text(cx + 0.08, cy, cwid_ - 0.12, rh, val, 10, NAVY, True, anchor='middle'); return True
        return False

    ty = y + 1.1; head_h = 0.34
    rh = max(0.22, min(0.3, (6.6 - ty - head_h) / max(1, len(rows))))
    end = table(B, 0.5, ty, cwid, head, rows, rh, 10, head_h=head_h, cell_fn=cell)
    data_note(B, d)
    B.text(0.5, end + 0.06, W - 1.0, 0.22, 'Checklist: semua proyek JIAT (Divisi 2) dan hanya proyek Irigasi/DIR yang sudah mengisi data. Sudah mengisi = minimal satu dimensi data pernah disimpan.', 9.5, SLATE_L, italic=True)


def slide_reguler(B, d):
    g = d['reguler']; j = d['jiat']
    content_slide(B, 'Proyek Divisi 2 Lainnya', 'Proyek Divisi 2 (Selain JIAT dan Irigasi) yang Sudah Mengisi')
    y = CY - 0.04
    by = {}
    for r in g['rows']: by[r['categoryLabel']] = by.get(r['categoryLabel'], 0) + 1
    sub = ', '.join(f"{k} {v}" for k, v in by.items())
    stat_card(B, 0.5, y, 4.0, 1.0, 'Sudah mengisi', f"{g['filledCount']} proyek", sub, 'green')
    stat_card(B, 4.66, y, 3.9, 1.0, 'PIC terdaftar', f"{g['picCount']}/{g['totalProyek']}", 'proyek Divisi 2 di luar JIAT & Irigasi', 'blue')
    stat_card(B, 8.72, y, 4.11, 1.0, 'Belum mengisi', f"{g['totalProyek'] - g['filledCount']} proyek", 'dari proyek yang sama', 'amber')
    cwid = [1.55, 3.85, 4.5, 1.3, 1.13]
    head = ['Kategori', 'Proyek', 'PIC terdaftar', 'Dimensi', 'Terakhir']
    rows = [[r['categoryLabel'], r['name'], clip(', '.join(r['pics']) or '-', 52), str(r['dims']), r['last'] or '-'] for r in g['rows']]
    end = table(B, 0.5, y + 1.14, cwid, head, rows, 0.31, 10)
    by0 = end + 0.2
    notes = []
    if d['jiatDiKategoriLain']:
        names = ' & '.join(x['name'] for x in d['jiatDiKategoriLain'])
        notes.append(f"{names} tercatat di kategori Lainnya (sudah ada PIC, belum mengisi), jadi belum masuk hitungan JIAT.")
    notes.append('Sudah mengisi = minimal satu dimensi data pernah disimpan.')
    nxt = []
    tanpa = [r['name'].replace('JIAT ', '') for r in j['rows'] if not r['hasPic']]
    perlu = [r for r in j['rows'] if r['hasPic'] and not r['filled']]
    if tanpa: nxt.append(f"Daftarkan PIC untuk {len(tanpa)} proyek JIAT: {', '.join(tanpa)}.")
    if perlu: nxt.append(f"Minta {len(perlu)} proyek JIAT ber-PIC segera mulai mengisi data.")
    nxt.append('Admin menetapkan PIC per proyek lebih dulu, lalu PIC mengisi dimensi data.')
    hh = min(6.8 - by0, 1.85)
    data_note(B, d)
    bullet_box(B, 0.5, by0, 6.05, hh, 'Catatan data', notes, bg=BLUE, size=10.5)
    bullet_box(B, 6.78, by0, 6.05, hh, 'Tindak lanjut', nxt, bg=AMBER_DK, size=10.5)


def build(backends):
    d = load_data()
    outs = []
    for B in backends:
        PAGE['n'] = 1
        slide_cover(B, d); slide_syarat(B, d); slide_dimensi(B, d)
        slide_dashboard(B, d); slide_adopsi(B, d); slide_reguler(B, d)
        outs.append(B.save())
    return outs


if __name__ == '__main__':
    which = sys.argv[1:] or ['pptx', 'pdf']
    bks = []
    if 'pptx' in which: bks.append(PptxBackend())
    if 'pdf' in which: bks.append(PdfBackend())
    for o in build(bks): print('Dibuat:', o)
