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
const DOC_TYPES = [
    // PDF & Office
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Teks & data
    'text/plain', 'text/csv', 'application/rtf',
    // Arsip
    'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Gambar (dokumen scan)
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
];
// Ekstensi yang diizinkan sebagai fallback bila browser mengirim MIME generik
// (mis. application/octet-stream untuk .dwg, .csv di sebagian OS).
const DOC_EXT = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'csv', 'rtf', 'zip', 'rar', '7z',
    'dwg', 'dxf', 'jpg', 'jpeg', 'png', 'webp', 'gif',
];

type Kind = 'gallery' | 'documents' | 'contract';

/**
 * POST /api/projects/[id]/upload  (admin/SSO only)
 * multipart/form-data: file=<binary>, kind=gallery|documents|contract, caption?=string
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
        if (!['gallery', 'documents', 'contract'].includes(kind)) {
            return NextResponse.json({ success: false, error: 'Jenis upload tidak valid' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ success: false, error: 'Ukuran file melebihi 25 MB' }, { status: 400 });
        }

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (kind === 'gallery') {
            if (!IMAGE_TYPES.includes(file.type)) {
                return NextResponse.json({ success: false, error: `Tipe gambar tidak didukung: ${file.type || ext}` }, { status: 400 });
            }
        } else {
            // documents / contract: terima bila MIME dikenal ATAU ekstensi aman.
            // Browser sering mengirim MIME kosong / octet-stream untuk .pptx/.dwg,
            // jadi ekstensi menjadi penentu utama.
            const okMime = DOC_TYPES.includes(file.type);
            const okExt = DOC_EXT.includes(ext);
            if (!okMime && !okExt) {
                console.warn(`[Upload] Ditolak — name="${file.name}" type="${file.type}" ext="${ext}"`);
                return NextResponse.json({ success: false, error: `Tipe file tidak didukung: ${file.type || ext || 'tidak dikenal'}` }, { status: 400 });
            }
        }

        const project = await Location.findById(id).select('_id name');
        if (!project) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = buildKey(id, kind, file.name);
        await putObject(key, buffer, file.type);

        const now = new Date();
        if (kind === 'gallery') {
            await Location.updateOne({ _id: id }, {
                $push: { gallery: { key, caption, uploadedAt: now } },
            });
        } else if (kind === 'documents') {
            await Location.updateOne({ _id: id }, {
                $push: { documents: { name: file.name, key, size: file.size, contentType: file.type, uploadedAt: now } },
            });
        } else if (kind === 'contract') {
            await Location.updateOne({ _id: id }, { $set: { contractFileKey: key } });
        }

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
    } catch (error: any) {
        console.error('[Project Upload] Error:', error?.message);
        return NextResponse.json({ success: false, error: 'Gagal mengunggah file' }, { status: 500 });
    }
}
