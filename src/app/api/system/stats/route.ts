import { NextResponse } from 'next/server';
import os from 'os';

let lastCpuUsage = process.cpuUsage();
let lastTime = Date.now();

export async function GET() {
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
            rss: mem.rss,           // Resident Set Size (total process memory)
            heapUsed: mem.heapUsed, // Node.js heap used
            heapTotal: mem.heapTotal,
        },
        cpu: {
            process: Math.round(cpuPercent * 10) / 10, // Process CPU %
            systemLoad: os.loadavg()[0],               // 1-min system load average
        },
        system: {
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            platform: os.platform(),
        }
    });
}
