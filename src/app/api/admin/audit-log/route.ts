import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AuditLog from '@/models/AuditLog';
import { requireAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

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
            query.$or = [
                { entityName: { $regex: search, $options: 'i' } },
                { detail: { $regex: search, $options: 'i' } },
                { by: { $regex: search, $options: 'i' } },
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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
