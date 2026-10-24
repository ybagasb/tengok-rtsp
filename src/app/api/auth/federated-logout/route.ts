import { NextResponse } from 'next/server';

export async function GET() {
    const domain = process.env.COGNITO_DOMAIN;
    const clientId = process.env.COGNITO_CLIENT_ID;
    
    const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    if (domain && clientId) {
        const logoutPath = domain.endsWith('/') ? 'logout' : '/logout';
        const logoutUrl = new URL(`${domain}${logoutPath}`);
        
        // Cognito logout endpoint uses 'logout_uri' (NOT 'redirect_uri').
        // The value MUST exactly match one of the "Allowed sign-out URLs" in Cognito.
        // Registered: http://localhost:3000, https://tengok.brantas-abipraya.co.id, etc.
        logoutUrl.searchParams.set('client_id', clientId);
        logoutUrl.searchParams.set('logout_uri', appUrl);

        const response = NextResponse.redirect(logoutUrl.toString());
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        return response;
    }

    // Fallback if Cognito is not configured
    const response = NextResponse.redirect(`${appUrl}/login`);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
}
