import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { buildKeyUnder, putPublicObject, isStorageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * POST /api/uploads/image  (admin/SSO only)
 * multipart/form-data: file=<image>, prefix?=<string> (default "location-images")
 *
 * Uploads a non-sensitive image to MinIO as public-read and returns a STABLE
 * public URL — suitable to store directly in a DB field rendered via <img src>.
 */
export async function POST(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    if (!isStorageConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Penyimpanan file (MinIO) belum dikonfigurasi.' },
            { status: 503 }
        );
    }

    try {
        const form = await req.formData();
        const file = form.get('file');
        const prefix = (form.get('prefix') as string) || 'location-images';

        if (!(file instanceof File)) {
            return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ success: false, error: 'Ukuran gambar melebihi 10 MB' }, { status: 400 });
        }
        if (!IMAGE_TYPES.includes(file.type)) {
            return NextResponse.json({ success: false, error: `Tipe gambar tidak didukung: ${file.type}` }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = buildKeyUnder(prefix, file.name);
        const url = await putPublicObject(key, buffer, file.type);

        return NextResponse.json({ success: true, url, key });
    } catch (error) {
        console.error('[Upload Image] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal mengunggah gambar' }, { status: 500 });
    }
}
