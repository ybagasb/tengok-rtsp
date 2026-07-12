import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import { requireAdmin } from '@/lib/apiAuth';

let lastCpuUsage = process.cpuUsage();
let lastTime = Date.now();

export async function GET(req: NextRequest) {
    // Only admin can view system stats
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const mem = process.memoryUsage();
    const now = Date.now();
    const elapsed = (now - lastTime) / 1000; // seconds

    // CPU percentage for this process
    const currentCpuUsage = process.cpuUsage();
    const userDiff = (currentCpuUsage.user - lastCpuUsage.user) / 1000; // ms
    const sysDiff = (currentCpuUsage.system - lastCpuUsage.system) / 1000; // ms
    const cpuPercent = Math.min(100, ((userDiff + sysDiff) / (elapsed * 1000)) * 100);

    lastCpuUsage = currentCpuUsage;
    lastTime = now;

    return NextResponse.json({
        memory: {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
        },
        cpu: {
            process: Math.round(cpuPercent * 10) / 10,
            systemLoad: os.loadavg()[0],
        },
        system: {
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            platform: os.platform(),
        }
    });
}
