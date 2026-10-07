import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireAdmin, requireProjectAccess, getAuditActor, getSessionSub, isSuperAdmin } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';
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
    'progressRencana', 'progressDeviasi', 'progressKeuangan', 'tagihanBelumDiproses',
    // Field baru — operasional
    'lingkupPekerjaan', 'sumberDaya', 'isuStrategis', 'kendala',
    // Field baru — hierarki organisasi
    'division', 'projectType',
    // Field baru — ikhtiar
    'cpi', 'spi',
    // Field baru — finansial (ringkas)
    'cashIn', 'cashOut', 'saldoKas', 'saldoHutang', 'bad', 'piutang', 'ccc', 'bebanKonstruksi', 'hasilUsaha',
    // Field baru — operasi (ringkas)
    'pu', 'bk', 'lk',
    // Field baru — monitoring pengadaan (major item)
    'monitoringPengadaan',
    // Field baru — legal & change management
    'changeManagement',
] as const;


async function sign(key?: string): Promise<string | null> {
    if (!key || !isStorageConfigured()) return null;
    try {
        return await getPresignedUrl(key);
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
            .lean() as any;
        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        // Hitung kemampuan akses SEBELUM menandatangani file. Server tetap
        // penegak: hanya editor yang menerima presigned URL / raw key.
        const sub = await getSessionSub();
        const superAdmin = sub ? await isSuperAdmin(sub) : false;
        const isPic = !!sub && Array.isArray(loc.picSubs) && loc.picSubs.includes(sub);
        const canEdit = superAdmin || isPic;

        // Resolve presigned URL hanya untuk editor. Non-editor: URL null dan
        // raw key dibuang (hanya metadata non-sensitif yang dikirim).
        let contractUrl: string | null = null;
        let gallery: any[];
        let documents: any[];
        if (canEdit) {
            [contractUrl, gallery, documents] = await Promise.all([
                sign(loc.contractFileKey),
                Promise.all((loc.gallery || []).map(async (g: any) => ({
                    ...g,
                    url: await sign(g.key),
                }))),
                Promise.all((loc.documents || []).map(async (d: any) => ({
                    ...d,
                    url: await sign(d.key),
                }))),
            ]);
        } else {
            // Buang key (lokasi objek privat) — hanya metadata yang aman dibagikan.
            gallery = (loc.gallery || []).map(({ key: _k, ...rest }: any) => rest);
            documents = (loc.documents || []).map(({ key: _k, ...rest }: any) => rest);
        }

        // Jangan kirim picSubs mentah ke klien — buang dari payload data.
        // contractFileKey juga dibuang agar key kontrak tidak bocor ke non-editor.
        const { picSubs: _picSubs, contractFileKey: _contractFileKey, ...safeLoc } = loc;
        void _picSubs;
        void _contractFileKey;

        return NextResponse.json({
            success: true,
            data: {
                ...safeLoc,
                contractUrl,
                gallery,
                documents,
                access: { canEdit, isSuperAdmin: superAdmin, isPic },
            },
        });
    } catch (error: any) {
        console.error('[Project GET] Error:', error?.message);
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
        const update: Record<string, any> = {};
        for (const field of EDITABLE_FIELDS) {
            if (field in body) update[field] = body[field];
        }

        // Basic clamps / validation.
        if ('progressPercent' in update) {
            const p = Number(update.progressPercent);
            update.progressPercent = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
        }
        if ('contractValue' in update) {
            const v = Number(update.contractValue);
            update.contractValue = Number.isFinite(v) && v >= 0 ? v : undefined;
        }
        if ('status' in update && !['planning', 'ongoing', 'completed'].includes(update.status)) {
            delete update.status;
        }
        if ('division' in update && !['DIVISI 1', 'DIVISI 2', 'DIVISI 3'].includes(update.division)) {
            delete update.division;
        }
        if ('projectType' in update && !['JO', 'NON_JO'].includes(update.projectType)) {
            delete update.projectType;
        }
        // CPI/SPI: angka index (umumnya 0..~2). Clamp ke rentang wajar 0..5.
        for (const idx of ['cpi', 'spi'] as const) {
            if (idx in update) {
                const n = Number(update[idx]);
                update[idx] = Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : undefined;
            }
        }
        // Finansial: angka IDR >= 0. (saldoKas & lk boleh negatif — ditangani di bawah.)
        for (const money of ['cashIn', 'cashOut', 'saldoHutang', 'bad', 'piutang', 'bebanKonstruksi', 'pu', 'bk'] as const) {
            if (money in update) {
                const n = Number(update[money]);
                update[money] = Number.isFinite(n) && n >= 0 ? n : undefined;
            }
        }
        if ('saldoKas' in update) {
            const n = Number(update.saldoKas);
            update.saldoKas = Number.isFinite(n) ? n : undefined;
        }
        // CCC: Cash Conversion Cycle dalam HARI. Bulatkan, clamp 0..3650.
        if ('ccc' in update) {
            const n = Number(update.ccc);
            update.ccc = Number.isFinite(n) ? Math.max(0, Math.min(3650, Math.round(n))) : undefined;
        }
        // LK (Laba Kotor) boleh negatif; jika PU & BK ada, hitung LK = PU - BK.
        if ('lk' in update) {
            const n = Number(update.lk);
            update.lk = Number.isFinite(n) ? n : undefined;
        }
        if (typeof update.pu === 'number' && typeof update.bk === 'number') {
            update.lk = update.pu - update.bk;
        }
        // Hasil usaha: pendapatan/biaya >= 0; laba = pendapatan - biaya (dihitung).
        if ('hasilUsaha' in update && update.hasilUsaha && typeof update.hasilUsaha === 'object') {
            const p = Math.max(0, Number(update.hasilUsaha.pendapatan) || 0);
            const b = Math.max(0, Number(update.hasilUsaha.biaya) || 0);
            update.hasilUsaha = { pendapatan: p, biaya: b, laba: p - b };
        }
        // Monitoring pengadaan: sanitasi persentase 0..100.
        if ('monitoringPengadaan' in update && Array.isArray(update.monitoringPengadaan)) {
            update.monitoringPengadaan = update.monitoringPengadaan
                .filter((m: any) => m && typeof m.nama === 'string' && m.nama.trim())
                .map((m: any) => {
                    const pct = Number(m.persentase);
                    return {
                        nama: String(m.nama).trim(),
                        persentase: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0,
                    };
                });
        }
        // Change management: validasi jenis enum (fallback LAINNYA).
        if ('changeManagement' in update && Array.isArray(update.changeManagement)) {
            const JENIS = ['PERUBAHAN_HARGA', 'PERUBAHAN_LINGKUP', 'KLAIM', 'LEGAL_ISSUE', 'LAINNYA'];
            update.changeManagement = update.changeManagement.map((c: any) => {
                if (c && typeof c === 'object' && c.jenis && !JENIS.includes(c.jenis)) {
                    return { ...c, jenis: 'LAINNYA' };
                }
                return c;
            });
        }

        const loc = await Location.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean() as any;
        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        const actor = await getAuditActor(req);
        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: loc.name,
            by: actor,
            detail: `Memperbarui detail proyek: ${loc.name}`,
        });

        return NextResponse.json({ success: true, data: loc });
    } catch (error: any) {
        console.error('[Project PATCH] Error:', error?.message);
        return NextResponse.json({ success: false, error: 'Gagal memperbarui proyek' }, { status: 400 });
    }
}

/**
 * DELETE /api/projects/[id]?kind=gallery|documents|contract&key=<objectKey>
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
            await Location.updateOne({ _id: id }, { $pull: { gallery: { key } } });
        } else if (kind === 'documents' && key) {
            await Location.updateOne({ _id: id }, { $pull: { documents: { key } } });
        } else if (kind === 'contract') {
            await Location.updateOne({ _id: id }, { $unset: { contractFileKey: '' } });
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
            detail: `Menghapus ${kind} dari proyek`,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Project DELETE] Error:', error?.message);
        return NextResponse.json({ success: false, error: 'Gagal menghapus file' }, { status: 500 });
    }
}
