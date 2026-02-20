import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
    const { url } = await req.json();

    if (!url) {
        return NextResponse.json({ status: 'offline', error: 'No URL provided' }, { status: 400 });
    }

    try {
        // Attempt to just fetch headers to see if it's reachable
        // Timeout quickly to avoid hanging
        await axios.head(url, { timeout: 3000 });
        return NextResponse.json({ status: 'online' });
    } catch (error) {
        return NextResponse.json({ status: 'offline' });
    }
}
