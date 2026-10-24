import { NextRequest } from 'next/server';
import { cameraStatusEmitter } from '@/lib/cameraStatusEmitter';
import { requireAuth } from '@/lib/apiAuth';

// Must be Node.js runtime (not Edge) + no caching
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    // Require authentication for SSE stream
    const authError = await requireAuth(req);
    if (authError) return authError;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            // Initial handshake comment so the browser EventSource fires onopen
            controller.enqueue(encoder.encode(': connected\n\n'));

            const onStatus = (payload: { cameraId: string; status: 'online' | 'offline' }) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch {
                    // Stream already closed
                }
            };

            cameraStatusEmitter.on('status', onStatus);

            // Keep-alive comment every 20s to prevent proxy / browser timeout
            const pingInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch {
                    clearInterval(pingInterval);
                }
            }, 20000);

            // Block here until the client disconnects
            await new Promise<void>((resolve) => {
                req.signal.addEventListener('abort', () => resolve(), { once: true });
            });

            // Cleanup after disconnect
            clearInterval(pingInterval);
            cameraStatusEmitter.off('status', onStatus);
            try { controller.close(); } catch { /* already closed */ }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
