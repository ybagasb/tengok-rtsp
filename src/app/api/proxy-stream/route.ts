import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return new NextResponse('URL is missing', { status: 400 });
    }

    try {
        const response = await fetch(url, {
            headers: {
                // Forward some headers to mimic a real client, but don't forward host
                'User-Agent': req.headers.get('User-Agent') || 'Mozilla/5.0',
                'Accept': '*/*, application/vnd.apple.mpegurl'
            }
        });

        if (!response.ok) {
            return new NextResponse(`Proxy error: ${response.status} ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl';

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Access-Control-Allow-Origin', '*');

        // Note: Shinobi returns relative paths within its .m3u8 files (e.g., 's123.ts').
        // If we just send the raw text, the browser tries to fetch 'https://tengok.../api/s123.ts'.
        // We must intercept .m3u8 files and rewrite relative paths into absolute proxied URLs.
        if (contentType.includes('mpegurl') || contentType.includes('m3u8') || url.endsWith('.m3u8')) {
            const text = await response.text();

            // Reconstruct the base url (remove the actual filename at the end)
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

            // Rewrite every line that isn't empty and isn't a master tag (starts with #)
            const rewrittenText = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line; // Keep tags as-is

                // If it's already an absolute URL, keep it, otherwise make it absolute relative to Shinobi
                const absoluteSegmentUrl = trimmed.startsWith('http') ? trimmed : `${baseUrl}${trimmed}`;

                // Wrap it back into our proxy
                return `/api/proxy-stream?url=${encodeURIComponent(absoluteSegmentUrl)}`;
            }).join('\n');

            return new NextResponse(rewrittenText, { status: 200, headers });
        }

        // For actual binary video chunks (.ts, .mp4, etc), just stream directly
        return new NextResponse(response.body, {
            status: 200,
            headers,
        });
    } catch (error: any) {
        console.error('Proxy Error:', error);
        return new NextResponse(`Proxy error: ${error.message}`, { status: 500 });
    }
}
