import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AuditLog from '@/models/AuditLog';
import { requireAdmin } from '@/lib/apiAuth';
import { escapeRegExp } from '@/lib/escapeRegExp';

export const dynamic = 'force-dynamic';

const MAX_SEARCH_LEN = 100;

export async function GET(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
        const entity = searchParams.get('entity');
        const action = searchParams.get('action');
        const search = searchParams.get('search')?.trim();

        const query: Record<string, any> = {};
        if (entity) query.entity = entity;
        if (action) query.action = action;
        if (search) {
            // Escape + cap panjang → cegah ReDoS / regex-injection dari input klien.
            const safe = escapeRegExp(search.slice(0, MAX_SEARCH_LEN));
            query.$or = [
                { entityName: { $regex: safe, $options: 'i' } },
                { detail: { $regex: safe, $options: 'i' } },
                { by: { $regex: safe, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(query),
        ]);

        return NextResponse.json({
            success: true,
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        });
    } catch (error: any) {
        console.error('[audit-log] API error:', error);
        return NextResponse.json({ success: false, error: 'Gagal memuat audit log' }, { status: 500 });
    }
}
