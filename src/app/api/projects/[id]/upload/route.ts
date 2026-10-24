import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireProjectAccess, getAuditActor } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';
import { buildKey, putObject, isStorageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
type Kind = 'gallery';

/**
 * POST /api/projects/[id]/upload  (admin/SSO only)
 * multipart/form-data: file=<binary>, kind=gallery, caption?=string
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const authError = await requireProjectAccess(req, id);
    if (authError) return authError;

    if (!isStorageConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Penyimpanan file (MinIO) belum dikonfigurasi.' },
            { status: 503 }
        );
    }

    await dbConnect();

    try {
        const form = await req.formData();
        const file = form.get('file');
        const kind = (form.get('kind') as string) as Kind;
        const caption = (form.get('caption') as string) || '';

        if (!(file instanceof File)) {
            return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
        }
        if (kind !== 'gallery') {
            return NextResponse.json({ success: false, error: 'Jenis upload tidak valid' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ success: false, error: 'Ukuran file melebihi 25 MB' }, { status: 400 });
        }

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        // Hanya foto galeri yang boleh diunggah (dokumen & berkas kontrak sudah dihapus).
        if (!IMAGE_TYPES.includes(file.type)) {
            return NextResponse.json({ success: false, error: `Tipe gambar tidak didukung: ${file.type || ext}` }, { status: 400 });
        }

        const project = await Location.findById(id).select('_id name');
        if (!project) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = buildKey(id, kind, file.name);
        await putObject(key, buffer, file.type);

        await Location.updateOne({ _id: id }, {
            $push: { gallery: { key, caption, uploadedAt: new Date() } },
        });

        const actor = await getAuditActor(req);
        logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: project.name,
            by: actor,
            detail: `Mengunggah ${kind} untuk proyek: ${project.name}`,
        });

        return NextResponse.json({ success: true, key });
    } catch (error) {
        console.error('[Project Upload] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal mengunggah file' }, { status: 500 });
    }
}
