import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    
    // Clear PIN auth cookies
    cookieStore.delete('auth_token');
    cookieStore.delete('auth_flag');
    
    // Clear SSO flag cookie
    cookieStore.delete('sso_flag');
    
    // Clear NextAuth session cookies
    cookieStore.delete('authjs.session-token');
    cookieStore.delete('authjs.callback-url');
    cookieStore.delete('authjs.csrf-token');
    cookieStore.delete('__Secure-authjs.session-token');
    cookieStore.delete('__Secure-authjs.callback-url');
    cookieStore.delete('__Secure-authjs.csrf-token');

    const response = NextResponse.json({ success: true });
    // Clear browser cache, cookies, and storage to prevent back-button access
    response.headers.set('Clear-Site-Data', '"cache", "storage"');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
}
