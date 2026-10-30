import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireProjectAccess, getAuditActor } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';
import { buildKey, putObject, isStorageConfigured } from '@/lib/storage';
import { stampSet } from '@/lib/projectSections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
type Kind = 'gallery' | 'documents';

// Dokumen pendukung: daftar ekstensi yang diizinkan (bukan "semua file", agar HTML/SVG/skrip
// tidak bisa diunggah). Tipe konten ditetapkan dari ekstensi, bukan dari klien.
const DOC_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};
const MAX_DOCUMENTS = 100;
const MAX_GALLERY = 200;

/**
 * POST /api/projects/[id]/upload  (admin/SSO only)
 * multipart/form-data: file=<binary>, kind=gallery|documents, caption?=string
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
        if (kind !== 'gallery' && kind !== 'documents') {
            return NextResponse.json({ success: false, error: 'Jenis upload tidak valid' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ success: false, error: 'Ukuran file melebihi 25 MB' }, { status: 400 });
        }

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (kind === 'gallery' && !IMAGE_TYPES.includes(file.type)) {
            return NextResponse.json({ success: false, error: `Tipe gambar tidak didukung: ${file.type || ext}` }, { status: 400 });
        }
        if (kind === 'documents' && !Object.prototype.hasOwnProperty.call(DOC_TYPES, ext)) {
            return NextResponse.json(
                { success: false, error: `Tipe file .${ext || '?'} tidak didukung. Yang boleh: ${Object.keys(DOC_TYPES).join(', ')}` },
                { status: 400 },
            );
        }

        const project = await Location.findById(id).select('_id name documents gallery');
        if (!project) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }
        if (kind === 'documents' && (project.documents?.length ?? 0) >= MAX_DOCUMENTS) {
            return NextResponse.json({ success: false, error: `Maksimal ${MAX_DOCUMENTS} dokumen per proyek` }, { status: 400 });
        }

        if (kind === 'gallery' && (project.gallery?.length ?? 0) >= MAX_GALLERY) {
            return NextResponse.json({ success: false, error: `Maksimal ${MAX_GALLERY} foto per proyek` }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = buildKey(id, kind, file.name);
        if (kind === 'documents') {
            const contentType = DOC_TYPES[ext];
            // Buang karakter kontrol dan pemisah path dari nama asli; batasi panjangnya.
            const name = (file.name.replace(/[\x00-\x1f\\/]/g, '_').trim() || `dokumen.${ext}`).slice(0, 200);
            await putObject(key, buffer, contentType);
            await Location.updateOne({ _id: id }, {
                $push: { documents: { name, key, size: file.size, contentType, uploadedAt: new Date() } },
                $set: stampSet(['documents'], await getAuditActor(req)),
            });
        } else {
            await putObject(key, buffer, file.type);
            await Location.updateOne({ _id: id }, {
                $push: { gallery: { key, caption, uploadedAt: new Date() } },
                $set: stampSet(['gallery'], await getAuditActor(req)),
            });
        }

        const actor = await getAuditActor(req);
        logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: project.name,
            by: actor,
            detail: `Mengunggah ${kind === 'documents' ? 'dokumen' : 'foto galeri'} untuk proyek: ${project.name}`,
        });

        return NextResponse.json({ success: true, key });
    } catch (error) {
        console.error('[Project Upload] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal mengunggah file' }, { status: 500 });
    }
}
