# -*- coding: utf-8 -*-
"""
Slide 1 halaman: rekap pengisian data proyek Divisi 1, 2, 3 untuk manajemen
(proyek mana yang belum mengisi dan siapa PIC-nya). PPTX + PDF dari satu sumber.

Data      : node --env-file=.env.local scripts/rekap_pengisian_snapshot.mjs
Jalankan  : python scripts/make_slide_rekap_pengisian.py
Output    : internal-docs/Rekap-Pengisian-Proyek-3-Divisi-<YYYY-MM-DD-HHMM>.pptx dan .pdf
            (internal-docs/ di-gitignore karena berisi nama PIC)
Butuh     : python-pptx, reportlab, Pillow, cairosvg (venv).

Penilaian 18 dimensi sama dengan laporan "Update Pengisian Proyek Divisi N" (sudah dicocokkan
1:1 dengan laporan 13 Nov 2026 13.48 untuk 56 proyek yang tidak berubah sejak itu).
"""
import json, os, sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
import make_slides as ms  # backend PPTX/PDF + palet bersama

DATA = 'scripts/slides-data/rekap-pengisian.json'
LOGO_A_SVG = 'public/abipraya_original.svg'
LOGO_A_PNG = '/tmp/abipraya_original.png'

# Rata-rata pengisian di laporan sebelumnya (Jumat 13 Nov 2026 13.48), untuk perbandingan.
PREV = {'label': '13 Nov', 'avg': {'DIVISI 1': 22, 'DIVISI 2': 58, 'DIVISI 3': 0}}

DIMS = ['Info Proyek', 'Tanggal Kontrak', 'No. Kontrak', 'Nilai Kontrak', 'Progres Fisik', 'Progres Rencana',
        'Finansial', 'Ikhtiar CPI/SPI', 'Kinerja (PU/BK)', 'Progres Mingguan', 'Progres Keuangan DIPA', 'Milestone',
        'Sumber Daya', 'Lingkup Pekerjaan', 'Laporan Bulanan', 'QHSSE', 'Galeri', 'Dokumen']
# "Belum mengisi": hanya data awal (identitas/kontrak/CPI hasil impor), belum ada isian PIC.
BELUM_MAX = 4


def num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)
def pos(v): return num(v) and v > 0
def nz(v): return num(v) and v != 0
def has(v): return v is not None and (not num(v) or v > 0)


def dims(r):
    return [
        any(pos(r[k]) for k in ['pmName', 'pmPhone', 'penggunaJasa', 'pengawas', 'penyediaJasa', 'contractor']),
        has(r['startDate']) and has(r['endDate']),
        pos(r['contractNumber']),
        pos(r['contractValue']),
        pos(r['progressPercent']),
        pos(r['progressRencana']),
        any(nz(r[k]) for k in ['tagihanBruto', 'cashIn', 'cashOut', 'saldoKas', 'saldoHutang', 'bad', 'piutang', 'ccc']),
        r['cpi'] is not None or r['spi'] is not None,
        nz(r['pu']) or nz(r['bk']),
        pos(r['progressMinggu']), pos(r['progressKeuangan']), pos(r['milestones']), pos(r['sumberDaya']),
        pos(r['lingkupPekerjaan']), pos(r['laporanBulanan']), pos(r['qhsse']), pos(r['gallery']), pos(r['documents']),
    ]


def person(n):
    """'ridha_ardandi' -> 'Ridha Ardandi'; nama lengkap dibiarkan."""
    if '_' in n and ' ' not in n:
        return ' '.join(p.capitalize() for p in n.split('_') if p)
    return n


def pic_line(pics):
    names = [person(p) for p in pics if p]
    if not pics: return None
    if not names: return f'{len(pics)} PIC (belum pernah login)'
    extra = len(pics) - 1
    return names[0] + (f' +{extra} PIC lain' if extra else '')


def summarize(d):
    out = {}
    for dv in ('DIVISI 1', 'DIVISI 2', 'DIVISI 3'):
        rs = [r for r in d['rows'] if r['division'] == dv]
        for r in rs: r['n'] = sum(dims(r))
        belum = [r for r in rs if r['n'] <= BELUM_MAX]
        # Kelompokkan per PIC (tim yang sama berurutan); proyek tanpa PIC di akhir.
        belum.sort(key=lambda r: (not r['pics'], pic_line(r['pics']) or '', r['name'].lower()))
        out[dv] = {
            'total': len(rs), 'avg': round(sum(r['n'] for r in rs) / (18 * len(rs)) * 100) if rs else 0,
            'lengkap': sum(1 for r in rs if r['n'] == 18), 'belum': belum,
            'tanpaPic': sum(1 for r in belum if not r['pics']),
        }
    return out


def logo_abipraya():
    import cairosvg
    cairosvg.svg2png(url=LOGO_A_SVG, write_to=LOGO_A_PNG, output_height=600)
    return LOGO_A_PNG


# ── Gambar (gaya laporan eksekutif: grid tetap, warna terbatas) ─────────────
INK = '0F172A'; MUTED = '64748B'; RULE = 'CBD5E1'; ZEBRA = 'F8FAFC'; HEAD = '1E293B'
RED = 'B91C1C'; AMBER_T = 'B45309'; GOOD = '047857'
X0 = 0.45
CW = ms.W - 2 * X0


def clip_w(text, size, w, bold=False):
    """Potong teks agar muat satu baris selebar w inci (metrik Helvetica)."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    f = 'Helvetica-Bold' if bold else 'Helvetica'
    if stringWidth(text, f, size) <= w * 72: return text
    while text and stringWidth(text + '...', f, size) > w * 72: text = text[:-1]
    return text.rstrip(' ,(') + '...'


def pic_cell(pics):
    """(teks, warna, tebal) untuk kolom PIC."""
    names = [person(p) for p in pics if p]
    if not pics: return ('Belum ada PIC', RED, True)
    if not names: return ('PIC belum pernah login', AMBER_T, False)
    return (names[0] + (' dkk.' if len(pics) > 1 else ''), INK, False)


def header(B, d):
    B.new()
    B.rect(0, 0, ms.W, ms.H, ms.WHITE)
    ms.logos(B, 0.42, 0.66)
    B.text(2.6, 0.14, ms.W - 5.2, 0.26, 'LAPORAN PENGISIAN DATA PROYEK · PMIS TENGOK', 10, ms.AMBER_DK, True, align='center', anchor='middle')
    B.text(2.6, 0.42, ms.W - 5.2, 0.4, 'Status Pengisian Data Proyek per Divisi', 20, INK, True, align='center', anchor='middle')
    B.rect(0, ms.HEADER_H, ms.W, 0.05, ms.AMBER)
    B.line(X0, ms.H - 0.36, ms.W - X0, ms.H - 0.36, RULE, 0.75)
    B.text(X0, ms.H - 0.34, 9, 0.3, f"Sumber: database Tengok, {d['tanggalLabel']} pukul {d['jamLabel']} WIB. Penilaian 18 dimensi data per proyek.",
           8.5, MUTED, anchor='middle')
    B.text(ms.W - X0 - 4, ms.H - 0.34, 4, 0.3, 'PT Brantas Abipraya (Persero) · Internal', 8.5, MUTED, align='right', anchor='middle')


def summary_table(B, y, S):
    cols = [('Divisi', 1.7, 'left'), ('Jumlah proyek', 1.55, 'center'), ('Rata-rata data terisi', 3.6, 'left'),
            ('Lengkap (18/18)', 1.65, 'center'), ('Belum mengisi', 1.65, 'center'), ('Belum ada PIC', CW - 1.7 - 1.55 - 3.6 - 1.65 - 1.65, 'center')]
    rh, hh = 0.285, 0.28
    x = X0
    B.rect(X0, y, CW, hh, HEAD)
    for lab, w, al in cols:
        B.text(x + 0.12, y, w - 0.24, hh, lab, 9, ms.WHITE, True, align=al, anchor='middle'); x += w
    rows = []
    for dv, sv in S.items():
        rows.append((dv.title(), sv['total'], sv['avg'], PREV['avg'][dv], sv['lengkap'], len(sv['belum']), sv['tanpaPic']))
    tot = sum(r[1] for r in rows)
    avg_all = round(sum(r[2] * r[1] for r in rows) / tot) if tot else 0
    prev_all = round(sum(r[3] * r[1] for r in rows) / tot) if tot else 0
    rows.append(('Total', tot, avg_all, prev_all, sum(r[4] for r in rows), sum(r[5] for r in rows), sum(r[6] for r in rows)))
    yy = y + hh
    for k, (nm, n, avg, prev, lk, bl, tp) in enumerate(rows):
        last = k == len(rows) - 1
        B.rect(X0, yy, CW, rh, 'F1F5F9' if last else (ms.WHITE if k % 2 == 0 else ZEBRA))
        B.line(X0, yy + rh, X0 + CW, yy + rh, RULE, 0.75 if last else 0.5)
        x = X0
        vals = [nm, str(n), None, str(lk), str(bl), str(tp)]
        for ci, ((lab, w, al), v) in enumerate(zip(cols, vals)):
            if ci == 2:
                bw = 1.7
                B.rect(x + 0.12, yy + rh / 2 - 0.05, bw, 0.1, 'E2E8F0')
                if avg: B.rect(x + 0.12, yy + rh / 2 - 0.05, bw * avg / 100, 0.1, INK if last else '334155')
                B.text(x + 0.12 + bw + 0.12, yy, w - bw - 0.36, rh,
                       [(f'{avg}%', {'bold': True, 'color': INK}), (f'  (13 Nov: {prev}%)', {'color': MUTED, 'size': 8.5})], 10, INK, anchor='middle')
            else:
                col = RED if ci in (4, 5) and v != '0' else INK
                B.text(x + 0.12, yy, w - 0.24, rh, v, 10, col, last or ci in (0, 4, 5), align=al, anchor='middle')
            x += w
        yy += rh
    return yy


def list_block(B, x, y, w, title, rows, start=1):
    """Tabel seragam: No | Proyek | PIC. Satu baris per proyek."""
    rh = 0.218; hh = 0.27
    nw, pw = 0.32, w * 0.36
    qw = w - nw - pw
    B.rect(x, y, w, hh, HEAD)
    B.text(x + 0.1, y, w - 0.2, hh, title, 9, ms.WHITE, True, anchor='middle')
    yy = y + hh
    for k, r in enumerate(rows):
        B.rect(x, yy, w, rh, ms.WHITE if k % 2 == 0 else ZEBRA)
        B.line(x, yy + rh, x + w, yy + rh, 'E2E8F0', 0.5)
        B.text(x, yy, nw - 0.08, rh, str(start + k), 8, MUTED, align='right', anchor='middle')
        B.text(x + nw + 0.04, yy, qw - 0.12, rh, clip_w(r['name'], 8.5, qw - 0.14), 8.5, INK, anchor='middle')
        t, c, b = pic_cell(r['pics'])
        B.text(x + nw + qw, yy, pw - 0.1, rh, clip_w(t, 8.5, pw - 0.12, b), 8.5, c, b, anchor='middle')
        yy += rh
    return yy


def build(backends, d):
    S = summarize(d)
    for v in S.values():  # yang belum ada PIC di bawah; sisanya urut nama PIC lalu proyek
        v['belum'].sort(key=lambda r: (not r['pics'], not any(r['pics']), (pic_cell(r['pics'])[0]).lower(), r['name'].lower()))
    total = sum(v['total'] for v in S.values())
    belum_all = sum(len(v['belum']) for v in S.values())
    tanpa = sum(v['tanpaPic'] for v in S.values())
    outs = []
    for B in backends:
        header(B, d)
        # Pesan utama
        B.text(X0, 1.08, CW, 0.36, [(f'{belum_all} dari {total} proyek', {'bold': True, 'color': RED}),
                                    (' belum mengisi data di PMIS Tengok; ', {}),
                                    (f'{tanpa} di antaranya belum memiliki PIC.', {'bold': True, 'color': INK})], 14, INK, anchor='middle')
        y = summary_table(B, 1.52, S)

        # Daftar proyek belum mengisi: 3 kolom setara (Divisi 1 dibagi dua, Divisi 2 dan 3 berbagi kolom ketiga)
        y += 0.18
        B.text(X0, y, CW, 0.24, 'Daftar proyek yang belum mengisi data', 11, INK, True, anchor='middle')
        y += 0.28
        g = 0.22; w3 = (CW - 2 * g) / 3
        d1, d2, d3 = (S[k]['belum'] for k in ('DIVISI 1', 'DIVISI 2', 'DIVISI 3'))
        half = (len(d1) + 1) // 2
        e1 = list_block(B, X0, y, w3, f'Divisi 1 · {len(d1)} proyek (1 – {half})', d1[:half])
        e2 = list_block(B, X0 + w3 + g, y, w3, f'Divisi 1 · lanjutan ({half + 1} – {len(d1)})', d1[half:], half + 1)
        yy = list_block(B, X0 + 2 * (w3 + g), y, w3, f'Divisi 2 · {len(d2)} proyek', d2)
        e3 = list_block(B, X0 + 2 * (w3 + g), yy + 0.12, w3, f'Divisi 3 · {len(d3)} proyek', d3)

        # Tindak lanjut
        ty = max(e1, e2, e3) + 0.16
        th = ms.H - 0.36 - 0.1 - ty
        if th < 0.34: print(f'  PERINGATAN: kotak tindak lanjut sempit ({th:.2f} in)')
        B.rect(X0, ty, CW, th, 'FFFBEB')
        B.rect(X0, ty, 0.06, th, ms.AMBER)
        B.text(X0 + 0.22, ty, 1.5, th, 'Tindak lanjut', 10, ms.AMBER_DK, True, anchor='middle')
        B.text(X0 + 1.6, ty, CW - 1.8, th,
               [('Divisi: ', {'bold': True}), ('tunjuk PIC untuk proyek berlabel "Belum ada PIC".   ', {}),
                ('PIC: ', {'bold': True}), ('isi Laporan Bulanan dan Progres di Detail Proyek.   ', {}),
                ('Definisi: ', {'bold': True}), (f'"belum mengisi" = baru data awal, maks. {BELUM_MAX} dari 18 dimensi.', {})],
               9, INK, anchor='middle')
        outs.append(B.save())
    return outs


if __name__ == '__main__':
    if not os.path.exists(DATA):
        sys.exit('Data belum ada. Jalankan: node --env-file=.env.local scripts/rekap_pengisian_snapshot.mjs')
    with open(DATA, encoding='utf-8') as f:
        data = json.load(f)
    stamp = datetime.fromisoformat(data['at'].replace('Z', '+00:00')).astimezone().strftime('%Y-%m-%d-%H%M')
    ms.OUT_BASE = f'internal-docs/Rekap-Pengisian-Proyek-3-Divisi-{stamp}'
    ms.LOGO_A = logo_abipraya()
    for o in build([ms.PptxBackend(), ms.PdfBackend()], data):
        print('Dibuat:', o)
    for dv, s in summarize(data).items():
        print(dv, s['total'], 'proyek, rata-rata', f"{s['avg']}%", 'lengkap', s['lengkap'], 'belum', len(s['belum']), 'tanpa PIC', s['tanpaPic'])
