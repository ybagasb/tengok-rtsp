import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AccessLog from '@/models/AccessLog';
import ShareLink from '@/models/ShareLink';

export async function GET() {
    try {
        await dbConnect();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 1. Total Visits in last 30 days
        const totalVisits = await AccessLog.countDocuments({ accessedAt: { $gte: thirtyDaysAgo } });

        // 2. Unique Visitors (distinct ipHash)
        const uniqueVisitorsArray = await AccessLog.distinct('ipHash', { accessedAt: { $gte: thirtyDaysAgo } });
        const uniqueVisitors = uniqueVisitorsArray.length;

        // 3. Device breakdown
        const deviceStats = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: '$deviceType', count: { $sum: 1 } } }
        ]);

        // 4. Daily visits last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyVisits = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%m-%d", date: "$accessedAt" } },
                    views: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 5. Popular Links
        const popularTokensAgg = await AccessLog.aggregate([
            { $match: { accessedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: '$token', views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 3 }
        ]);

        // Fetch labels for popular tokens
        const popularTokensWithDetails = await Promise.all(
            popularTokensAgg.map(async (item) => {
                const link = await ShareLink.findOne({ token: item._id }).select('label');
                return {
                    name: link?.label || item._id,
                    token: item._id,
                    views: item.views
                };
            })
        );

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalVisits,
                    uniqueVisitors
                },
                deviceStats: deviceStats.map(d => ({ name: d._id.charAt(0).toUpperCase() + d._id.slice(1), value: d.count })),
                dailyVisits: dailyVisits.map(d => ({ date: d._id, views: d.views })),
                popularLinks: popularTokensWithDetails
            }
        });
    } catch (error: any) {
        console.error('Failed to fetch stats summary:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
    }
}
