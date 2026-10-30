import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireAdmin, requireProjectAccess, getAuditActor, getSessionIdentity, isSuperAdmin, matchProjectPic } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';
import { derivedFromLaporan, isValidPeriode } from '@/lib/projectReport';
import { loadDeriveSource, syncLegacy } from '@/lib/projectSync';
import {
    validPhone, sanitizeMilestones, sanitizeSumberDaya, sanitizeIsuStrategis, sanitizeKendala,
    sanitizeProgressKeuangan, sanitizeProgressMinggu, sanitizeChangeManagement, sanitizeLingkup,
    sanitizeMonitoringPengadaan,
} from '@/lib/projectInputs';
import { sectionsForFields, stampSet } from '@/lib/projectSections';
import { getPresignedUrl, deleteObject, isStorageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Fields an admin may update via PATCH. streamUrl/cameras are managed elsewhere.
const EDITABLE_FIELDS = [
    'name', 'description', 'status', 'contractor', 'startDate', 'endDate',
    'contractNumber', 'contractValue', 'progressPercent', 'milestones', 'pmName', 'pmPhone',
    // Field baru — identitas proyek
    'penggunaJasa', 'pengawas', 'penyediaJasa',
    // Field baru — progress
    'progressRencana', 'progressDeviasi', 'progressPeriode', 'progressKeuangan', 'tagihanBelumDiproses',
    // Field baru — operasional
    'lingkupPekerjaan', 'sumberDaya', 'isuStrategis', 'kendala',
    // Field baru — hierarki organisasi
    'division', 'projectType',
    // Field baru — ikhtiar
    'cpi', 'spi',
    // Field baru — finansial (ringkas)
    'tagihanBruto', 'cashIn', 'cashOut', 'saldoKas', 'saldoHutang', 'bad', 'piutang', 'ccc', 'bebanKonstruksi', 'hasilUsaha',
    // Field baru — operasi (ringkas)
    'pu', 'bk', 'lk',
    // Field baru — monitoring pengadaan (major item)
    'monitoringPengadaan',
    // Field baru — legal & change management
    'changeManagement',
    // Field baru — progress mingguan W1-W4 (RA/RI)
    'progressMinggu',
    // Footprint bangunan (blok 3D di peta)
    'footprint', 'footprintHeight',
] as const;


// Field lama yang bisa diturunkan dari laporan bulanan (lihat derivedFromLaporan).
const DERIVED_KEYS = ['cpi', 'spi', 'tagihanBruto', 'hasilUsaha', 'pu', 'lk', 'cashIn', 'cashOut', 'saldoHutang', 'bad', 'piutang', 'ccc'] as const;

const MAX_TEXT_LENGTH = 10000;

// Label ramah untuk pesan validasi.
const FIELD_LABELS: Record<string, string> = {
    description: 'Deskripsi', kendala: 'Kendala', isuStrategis: 'Isu strategis',
    lingkupPekerjaan: 'Lingkup pekerjaan', startDate: 'Tanggal mulai', endDate: 'Tanggal selesai',
    tagihanBruto: 'Tagihan bruto', cashIn: 'Cash in', cashOut: 'Cash out',
    saldoHutang: 'Saldo hutang', bad: 'BAD', piutang: 'Piutang',
    bebanKonstruksi: 'Beban konstruksi', pu: 'PU', bk: 'BK',
};

// Shape of the lean project document as used by GET (other fields pass through).
interface ProjectLean {
    _id: unknown;
    name?: string;
    picSubs?: string[];
    contractFileKey?: string; // legacy: tidak lagi dipakai; tetap dibuang dari respons bila masih ada di dokumen lama
    gallery?: Record<string, unknown>[];
    documents?: Record<string, unknown>[];
    [key: string]: unknown;
}

// Working copy of the (unvalidated) PATCH body fields; validated/sanitized below.
interface ProjectUpdateDraft {
    status?: string;
    division?: string;
    projectType?: string;
    startDate?: string | number | Date;
    endDate?: string | number | Date;
    hasilUsaha?: { pendapatan?: unknown; biaya?: unknown; laba?: unknown };
    monitoringPengadaan?: Array<{ nama?: unknown; persentase?: unknown }>;
    changeManagement?: Array<{ jenis?: string } | null | undefined>;
    [key: string]: unknown;
}

async function sign(key?: string, downloadName?: string): Promise<string | null> {
    if (!key || !isStorageConfigured()) return null;
    try {
        return await getPresignedUrl(key, 3600, downloadName ? { downloadName } : undefined);
    } catch {
        return null;
    }
}

/**
 * GET /api/projects/[id]  (SSO only)
 * Hanya sesi SSO yang boleh membaca detail proyek — viewer PIN ditolak 403.
 * Presigned URL file + raw key HANYA dikirim bila pemanggil adalah editor
 * (super-admin atau PIC proyek). Non-editor SSO mendapat metadata tanpa URL/key.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const { id } = await props.params;
    await dbConnect();

    try {
        const loc = await Location.findById(id)
            .populate('cameras', 'name status lastCheckedAt lastOnlineAt')
            .lean<ProjectLean>();
        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        // Hitung kemampuan akses SEBELUM menandatangani file. Server tetap
        // penegak: hanya editor yang menerima presigned URL / raw key.
        const { sub, username } = await getSessionIdentity();
        const superAdmin = sub ? await isSuperAdmin(sub) : false;
        const picSubs: string[] = Array.isArray(loc.picSubs) ? loc.picSubs : [];
        // Kecocokan PIC: sub asli ATAU placeholder `ldap_<username>` (user yang
        // belum pernah login ke aplikasi penulis sub asli). Lihat matchProjectPic.
        const { match: isPic, placeholder } = matchProjectPic(picSubs, { sub, username });
        const canEdit = superAdmin || isPic;

        // SELF-HEAL: bila PIC dikenali lewat placeholder, upgrade ke sub asli
        // begitu halaman proyek dibuka (best-effort; tak boleh menggagalkan GET).
        if (isPic && placeholder && sub) {
            try {
                const healed = [...new Set(picSubs.map((s) => (s === placeholder ? sub : s)))];
                await Location.updateOne({ _id: loc._id }, { $set: { picSubs: healed } });
            } catch (healErr) {
                console.warn('[Project GET] self-heal gagal:', (healErr as { message?: string })?.message);
            }
        }

        // Resolve presigned URL hanya untuk editor. Non-editor: URL null dan
        // raw key dibuang (hanya metadata non-sensitif yang dikirim).
        let gallery: Record<string, unknown>[];
        let documents: Record<string, unknown>[];
        if (canEdit) {
            [gallery, documents] = await Promise.all([
                Promise.all((loc.gallery || []).map(async (g: Record<string, unknown>) => ({
                    ...g,
                    url: await sign(g.key as string | undefined),
                }))),
                Promise.all((loc.documents || []).map(async (d: Record<string, unknown>) => ({
                    ...d,
                    url: await sign(d.key as string | undefined, typeof d.name === 'string' ? d.name : undefined),
                }))),
            ]);
        } else {
            // Buang key (lokasi objek privat) — hanya metadata yang aman dibagikan.
            gallery = (loc.gallery || []).map((g: Record<string, unknown>) => {
                const rest = { ...g };
                delete rest.key;
                return rest;
            });
            documents = (loc.documents || []).map((d: Record<string, unknown>) => {
                const rest = { ...d };
                delete rest.key;
                return rest;
            });
        }

        // Jangan kirim picSubs mentah ke klien — buang dari payload data.
        // contractFileKey (field lama, sudah tidak dipakai) tetap dibuang agar tidak bocor bila masih ada di dokumen lama.
        const { picSubs: _picSubs, contractFileKey: _contractFileKey, ...safeLoc } = loc;
        void _picSubs;
        void _contractFileKey;

        return NextResponse.json({
            success: true,
            data: {
                ...safeLoc,
                gallery,
                documents,
                access: { canEdit, isSuperAdmin: superAdmin, isPic },
            },
        });
    } catch (error) {
        console.error('[Project GET] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal memuat detail proyek' }, { status: 500 });
    }
}

/**
 * PATCH /api/projects/[id]  (admin/SSO only)
 * Update project detail fields (whitelisted).
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const authError = await requireProjectAccess(req, id);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const update: ProjectUpdateDraft = {};
        for (const field of EDITABLE_FIELDS) {
            if (field in body) update[field] = body[field];
        }

        // Field yang diturunkan dari Laporan Bulanan terbaru TIDAK boleh ditulis
        // langsung (satu sumber kebenaran). Dibuang diam-diam karena klien yang
        // benar sudah tidak mengirimnya; klien lama/basi tak bisa menimpa laporan.
        if (DERIVED_KEYS.some((k) => k in update)) {
            const src = await loadDeriveSource(id);
            for (const k of Object.keys(derivedFromLaporan(src ?? undefined))) delete update[k];
        }

        // Validasi: nilai SALAH ditolak 400 dengan pesan jelas (bukan dibuang
        // diam-diam). Nilai kosong ('' / null) dianggap "kosongkan field".
        const invalid: string[] = [];
        const isBlank = (v: unknown) => v === '' || v === null || v === undefined;

        // Batas panjang untuk field teks bebas.
        for (const [k, v] of Object.entries(update)) {
            if (typeof v === 'string' && v.length > MAX_TEXT_LENGTH) {
                invalid.push(`${FIELD_LABELS[k] ?? k} terlalu panjang (maks ${MAX_TEXT_LENGTH} karakter)`);
            }
        }

        // Progres fisik: 0..100 dengan 2 desimal (sama dengan presisi slider di UI).
        // Kosong = hapus nilai. Deviasi SELALU dihitung server (realisasi − rencana).
        const round2 = (n: number) => Math.round(n * 100) / 100;
        for (const [key, label] of [['progressPercent', 'Progres fisik (realisasi)'], ['progressRencana', 'Progres fisik (rencana)']] as const) {
            if (key in update) {
                if (isBlank(update[key])) { update[key] = undefined; continue; }
                const p = Number(update[key]);
                if (!Number.isFinite(p) || p < 0 || p > 100) {
                    invalid.push(`${label} harus angka antara 0 dan 100`);
                    update[key] = undefined;
                } else {
                    update[key] = round2(p);
                }
            }
        }
        delete update.progressDeviasi;
        if ('pmPhone' in update) {
            const ph = typeof update.pmPhone === 'string' ? update.pmPhone.trim() : '';
            if (isBlank(update.pmPhone) || ph === '') update.pmPhone = undefined;
            else if (!validPhone(ph)) invalid.push('Kontak PIC tidak valid (8-15 digit, boleh diawali +)');
            else update.pmPhone = ph;
        }
        if ('tagihanBelumDiproses' in update) {
            const n = Number(update.tagihanBelumDiproses);
            if (!isBlank(update.tagihanBelumDiproses) && (!Number.isFinite(n) || n < 0)) invalid.push('Progress belum ditagihkan harus angka ≥ 0');
            update.tagihanBelumDiproses = !isBlank(update.tagihanBelumDiproses) && Number.isFinite(n) && n >= 0 ? n : undefined;
        }
        // Sub-dokumen: tiap baris divalidasi, galat menyebut baris ke-N.
        if ('milestones' in update) update.milestones = sanitizeMilestones(update.milestones, invalid);
        if ('sumberDaya' in update) update.sumberDaya = sanitizeSumberDaya(update.sumberDaya, invalid);
        if ('isuStrategis' in update) update.isuStrategis = sanitizeIsuStrategis(update.isuStrategis, invalid);
        if ('kendala' in update) update.kendala = sanitizeKendala(update.kendala, invalid);
        if ('progressKeuangan' in update) update.progressKeuangan = sanitizeProgressKeuangan(update.progressKeuangan, invalid);
        if ('progressMinggu' in update) update.progressMinggu = sanitizeProgressMinggu(update.progressMinggu, invalid);
        if ('changeManagement' in update) update.changeManagement = sanitizeChangeManagement(update.changeManagement, invalid);
        if ('lingkupPekerjaan' in update) update.lingkupPekerjaan = sanitizeLingkup(update.lingkupPekerjaan, invalid);
        if ('monitoringPengadaan' in update) update.monitoringPengadaan = sanitizeMonitoringPengadaan(update.monitoringPengadaan, invalid);
        // Tanggal kosong = hapus tanggal.
        for (const d of ['startDate', 'endDate'] as const) {
            if (d in update && isBlank(update[d])) update[d] = undefined;
        }
        if ('progressPeriode' in update) {
            if (isBlank(update.progressPeriode)) update.progressPeriode = undefined;
            else if (!isValidPeriode(update.progressPeriode)) invalid.push('Bulan progres fisik tidak valid (format YYYY-MM)');
        }
        if ('contractValue' in update) {
            const v = Number(update.contractValue);
            if (!isBlank(update.contractValue) && (!Number.isFinite(v) || v < 0)) invalid.push('Nilai kontrak harus angka ≥ 0');
            update.contractValue = Number.isFinite(v) && v >= 0 && !isBlank(update.contractValue) ? v : undefined;
        }
        if ('status' in update && !['planning', 'ongoing', 'completed'].includes(update.status as string)) {
            invalid.push('Status proyek tidak valid');
        }
        if ('division' in update && !['DIVISI 1', 'DIVISI 2', 'DIVISI 3'].includes(update.division as string)) {
            invalid.push('Divisi tidak valid');
        }
        if ('projectType' in update && !['JO', 'NON_JO'].includes(update.projectType as string)) {
            invalid.push('Tipe proyek tidak valid');
        }
        // CPI/SPI: angka index (umumnya 0..~2). Wajar 0..5; di luar itu ditolak.
        for (const idx of ['cpi', 'spi'] as const) {
            if (idx in update) {
                const n = Number(update[idx]);
                if (!isBlank(update[idx]) && (!Number.isFinite(n) || n < 0 || n > 5)) {
                    invalid.push(`${idx.toUpperCase()} harus angka antara 0 dan 5`);
                }
                update[idx] = !isBlank(update[idx]) && Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : undefined;
            }
        }
        // Finansial: angka IDR >= 0. (saldoKas & lk boleh negatif — ditangani di bawah.)
        for (const money of ['tagihanBruto', 'cashIn', 'cashOut', 'saldoHutang', 'bad', 'piutang', 'bebanKonstruksi', 'pu', 'bk'] as const) {
            if (money in update) {
                const n = Number(update[money]);
                if (!isBlank(update[money]) && (!Number.isFinite(n) || n < 0)) {
                    invalid.push(`${FIELD_LABELS[money] ?? money} harus angka ≥ 0`);
                }
                update[money] = !isBlank(update[money]) && Number.isFinite(n) && n >= 0 ? n : undefined;
            }
        }
        if ('saldoKas' in update) {
            const n = Number(update.saldoKas);
            if (!isBlank(update.saldoKas) && !Number.isFinite(n)) invalid.push('Saldo kas harus berupa angka');
            update.saldoKas = !isBlank(update.saldoKas) && Number.isFinite(n) ? n : undefined;
        }
        // Tanggal: harus valid, dan selesai tidak boleh sebelum mulai.
        for (const d of ['startDate', 'endDate'] as const) {
            if (d in update && !isBlank(update[d]) && Number.isNaN(new Date(update[d]).getTime())) {
                invalid.push(`${FIELD_LABELS[d]} tidak valid`);
            }
        }
        if (!isBlank(update.startDate) && !isBlank(update.endDate)) {
            const s = new Date(update.startDate).getTime();
            const e = new Date(update.endDate).getTime();
            if (Number.isFinite(s) && Number.isFinite(e) && e < s) {
                invalid.push('Tanggal selesai tidak boleh sebelum tanggal mulai');
            }
        }

        // Footprint bangunan: kosong = hapus; selain itu 3..200 titik valid dalam
        // rentang wajar (bbox <= 0.05 derajat ≈ 5 km) agar data sampah tertolak.
        if ('footprint' in update) {
            const fp = update.footprint;
            if (isBlank(fp) || (Array.isArray(fp) && fp.length === 0)) {
                update.footprint = [];
            } else if (!Array.isArray(fp) || fp.length < 3 || fp.length > 200) {
                invalid.push('Footprint harus berisi 3 sampai 200 titik');
            } else {
                const pts = fp.map((q: { lng?: unknown; lat?: unknown } | null | undefined) => ({ lng: Number(q?.lng), lat: Number(q?.lat) }));
                if (pts.some((q) => !Number.isFinite(q.lng) || !Number.isFinite(q.lat) || Math.abs(q.lat) > 90 || Math.abs(q.lng) > 180)) {
                    invalid.push('Koordinat footprint tidak valid');
                } else {
                    const lngs = pts.map((q) => q.lng);
                    const lats = pts.map((q) => q.lat);
                    if (Math.max(...lngs) - Math.min(...lngs) > 0.05 || Math.max(...lats) - Math.min(...lats) > 0.05) {
                        invalid.push('Footprint terlalu luas (maksimal sekitar 5 km)');
                    } else {
                        update.footprint = pts.map((q) => ({ lng: Number(q.lng.toFixed(7)), lat: Number(q.lat.toFixed(7)) }));
                    }
                }
            }
        }
        if ('footprintHeight' in update) {
            if (isBlank(update.footprintHeight)) {
                update.footprintHeight = undefined;
            } else {
                const h = Number(update.footprintHeight);
                if (!Number.isFinite(h) || h < 1 || h > 300) {
                    invalid.push('Tinggi footprint harus 1 sampai 300 meter');
                } else {
                    update.footprintHeight = Math.round(h * 10) / 10;
                }
            }
        }

        if (invalid.length > 0) {
            return NextResponse.json(
                { success: false, error: invalid.join('; '), fields: invalid },
                { status: 400 },
            );
        }
        // CCC: Cash Conversion Cycle dalam HARI. Bulatkan, clamp 0..3650. Kosong = hapus.
        if ('ccc' in update) {
            const n = Number(update.ccc);
            update.ccc = !isBlank(update.ccc) && Number.isFinite(n) ? Math.max(0, Math.min(3650, Math.round(n))) : undefined;
        }
        // LK (Laba Kotor) boleh negatif; jika PU & BK ada, hitung LK = PU - BK. Kosong = hapus.
        if ('lk' in update) {
            const n = Number(update.lk);
            update.lk = !isBlank(update.lk) && Number.isFinite(n) ? n : undefined;
        }
        if (typeof update.pu === 'number' && typeof update.bk === 'number') {
            update.lk = update.pu - update.bk;
        }
        // Hasil usaha: pendapatan/biaya >= 0; laba = pendapatan - biaya (dihitung). Kosong = hapus.
        if ('hasilUsaha' in update) {
            if (update.hasilUsaha && typeof update.hasilUsaha === 'object') {
                const p = Math.max(0, Number(update.hasilUsaha.pendapatan) || 0);
                const b = Math.max(0, Number(update.hasilUsaha.biaya) || 0);
                update.hasilUsaha = { pendapatan: p, biaya: b, laba: p - b };
            } else {
                update.hasilUsaha = undefined;
            }
        }

        // Deviasi progres fisik = realisasi − rencana, dihitung server dari nilai tersimpan.
        if ('progressPercent' in update || 'progressRencana' in update) {
            const cur = await Location.findById(id).select('progressPercent progressRencana').lean<{ progressPercent?: number; progressRencana?: number }>();
            const real = 'progressPercent' in update ? update.progressPercent : cur?.progressPercent;
            const rencana = 'progressRencana' in update ? update.progressRencana : cur?.progressRencana;
            update.progressDeviasi = round2((Number(real) || 0) - (Number(rencana) || 0));
        }

        // Nilai undefined = "kosongkan field": Mongoose membuang key undefined di $set,
        // jadi dipindah ke $unset agar benar-benar terhapus.
        const $set: Record<string, unknown> = {};
        const $unset: Record<string, ''> = {};
        for (const [k, v] of Object.entries(update)) {
            if (v === undefined) $unset[k] = '';
            else $set[k] = v;
        }
        // Catat waktu & pelaku pembaruan per dimensi data.
        const actor = await getAuditActor(req);
        Object.assign($set, stampSet(sectionsForFields(Object.keys(update)), actor));
        const op: Record<string, unknown> = {};
        if (Object.keys($set).length) op.$set = $set;
        if (Object.keys($unset).length) op.$unset = $unset;

        const loc = await Location.findByIdAndUpdate(id, op, { new: true, runValidators: true }).lean<ProjectLean>();
        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        // LK = PU − BK: PU berasal dari laporan, jadi hitung ulang bila BK diubah.
        if ('bk' in update) await syncLegacy(id);

        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: loc.name ?? '',
            by: actor,
            detail: `Memperbarui detail proyek: ${loc.name} (field: ${Object.keys(update).join(', ') || '-'})`,
        });

        return NextResponse.json({ success: true, data: loc });
    } catch (error) {
        console.error('[Project PATCH] Error:', error instanceof Error ? error.message : undefined);
        // Galat skema/cast = isian salah (400); selain itu galat server (500).
        const name = (error as { name?: string })?.name;
        if (name === 'ValidationError' || name === 'CastError') {
            const paths = name === 'ValidationError'
                ? Object.keys((error as { errors?: Record<string, unknown> }).errors ?? {})
                : [String((error as { path?: string }).path ?? '')];
            const where = paths.filter(Boolean).join(', ');
            return NextResponse.json(
                { success: false, error: where ? `Isian tidak valid pada: ${where}` : 'Isian tidak valid' },
                { status: 400 },
            );
        }
        return NextResponse.json({ success: false, error: 'Gagal memperbarui proyek' }, { status: 500 });
    }
}

/**
 * DELETE /api/projects/[id]?kind=gallery|documents&key=<objectKey>
 * Removes a file reference from the project and deletes the object from MinIO.
 */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const authError = await requireProjectAccess(req, id);
    if (authError) return authError;

    const kind = req.nextUrl.searchParams.get('kind');
    const key = req.nextUrl.searchParams.get('key');
    await dbConnect();

    try {
        if (kind === 'gallery' && key) {
            await Location.updateOne({ _id: id }, { $pull: { gallery: { key } }, $set: stampSet(['gallery'], await getAuditActor(req)) });
        } else if (kind === 'documents' && key) {
            await Location.updateOne({ _id: id }, { $pull: { documents: { key } }, $set: stampSet(['documents'], await getAuditActor(req)) });
        } else {
            return NextResponse.json({ success: false, error: 'Parameter tidak valid' }, { status: 400 });
        }

        // Best-effort delete from storage (keep DB consistent even if this fails).
        if (key && isStorageConfigured()) {
            deleteObject(key).catch(() => { /* orphaned object is acceptable */ });
        }

        const actor = await getAuditActor(req);
        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: id,
            by: actor,
            detail: `Menghapus ${kind} dari proyek${key ? ` (${key})` : ''}`,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Project DELETE] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal menghapus file' }, { status: 500 });
    }
}
