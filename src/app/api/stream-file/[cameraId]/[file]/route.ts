import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    req: Request,
    context: { params: Promise<{ cameraId: string; file: string }> }
) {
    const { cameraId, file } = await context.params;
    const filePath = path.join(process.cwd(), 'public', 'streams', cameraId, file);

    if (!fs.existsSync(filePath)) {
        return new NextResponse("Not Found", { status: 404 });
    }

    try {
        if (file.endsWith('.m3u8')) {
            let content = fs.readFileSync(filePath, 'utf-8');
            const baseUrl = `/api/stream-file/${cameraId}/`;

            // Replace relative .ts segment lines with full API path
            // trim() handles Windows CRLF endings \r\n
            content = content.split('\n').map((line) => {
                const trimmed = line.trim();
                if (trimmed.endsWith('.ts') && !trimmed.startsWith('#') && !trimmed.startsWith('http') && !trimmed.startsWith('/')) {
                    return `${baseUrl}${trimmed}`;
                }
                return line;
            }).join('\n');

            console.log(`[stream-file] Served m3u8 for ${cameraId}`);
            return new NextResponse(content, {
                headers: {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } else if (file.endsWith('.ts')) {
            // Serve raw TS segment
            const fileBuffer = fs.readFileSync(filePath);
            return new NextResponse(fileBuffer, {
                headers: {
                    'Content-Type': 'video/MP2T',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        return new NextResponse("Unsupported file type", { status: 400 });
    } catch (error) {
        console.error("Error serving HLS file:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
