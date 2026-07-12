import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AccessLog from '@/models/AccessLog';
import ShareLink from '@/models/ShareLink';
import { requireAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Only admin can view statistics
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const daysParam = parseInt(searchParams.get('days') || '30', 10);
        
        // Base threshold (for totals, uniques, breakdown)
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - daysParam);
        
        // Ensure Trend Chart (dailyVisits) always shows exactly the requested days.
        const trendStartDate = new Date();
        trendStartDate.setDate(trendStartDate.getDate() - daysParam);

        // ── 1. Total Visits (all sources) ────────────────────────────────────
        const totalVisits = await AccessLog.countDocuments({ accessedAt: { $gte: thresholdDate } });

        // ── 2. Unique Visitors (distinct ipHash, all sources) ────────────────
        const uniqueVisitorsArr = await AccessLog.distinct('ipHash', { accessedAt: { $gte: thresholdDate } });
        const uniqueVisitors = uniqueVisitorsArr.length;

        // ── 3. Visits by source (page type) ─────────────────────────────────
        const bySourceAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: thresholdDate } } },
            { $group: { _id: { $ifNull: ['$page', 'app'] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);
        const visitsBySource = bySourceAgg.map((s: any) => ({
            page: s._id,
            label: pageLabel(s._id),
            count: s.count,
        }));

        // ── 4. Device breakdown ──────────────────────────────────────────────
        const deviceStats = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: thresholdDate } } },
            { $group: { _id: '$deviceType', count: { $sum: 1 } } },
        ]);

        // ── 5. Daily visits (unique and total) ───────────────────
        const dailyVisits = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: trendStartDate } } },
            {
                $group: {
                    _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$accessedAt' } } },
                    views: { $sum: 1 },
                    uniqueIps: { $addToSet: '$ipHash' }
                },
            },
            { $sort: { '_id.date': 1 } },
        ]);

        const dailyVisitsSummary = dailyVisits.map((d: any) => ({
            date: d._id.date.substring(5), // Keep MM-DD
            views: d.views,
            unique: d.uniqueIps.length
        }));

        // ── 6. Popular Shared Links ──────────────────────────────────────────
        const popularTokensAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: thresholdDate }, token: { $ne: null } } },
            { $group: { _id: '$token', views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 3 },
        ]);
        const popularLinks = await Promise.all(
            popularTokensAgg.map(async (item: any) => {
                const link = await ShareLink.findOne({ token: item._id }).select('label');
                return {
                    name: link?.label || item._id,
                    token: item._id,
                    views: item.views,
                };
            })
        );

        // ── 7. Live active visitors (last 15 minutes) ────────────────────────
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        const liveVisitorsArr = await AccessLog.distinct('ipHash', { accessedAt: { $gte: fifteenMinsAgo } });
        const liveVisitors = liveVisitorsArr.length;

        return NextResponse.json({
            success: true,
            data: {
                summary: { totalVisits, uniqueVisitors, liveVisitors },
                visitsBySource,
                deviceStats: deviceStats.map((d: any) => ({
                    name: d._id.charAt(0).toUpperCase() + d._id.slice(1),
                    value: d.count,
                })),
                dailyVisits: dailyVisitsSummary,
                popularLinks,
            },
        });
    } catch (error: any) {
        console.error('Failed to fetch stats summary:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
    }
}

function pageLabel(page: string | null): string {
    switch (page) {
        case 'shared': return 'Link Berbagi';
        case 'categories': return 'Halaman Kategori';
        case 'map': return 'Halaman Peta';
        case 'app': return 'Aplikasi Utama';
        default: return page || 'Tidak Diketahui';
    }
}
