import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { cookies } from "next/headers";

export const { handlers, signIn, signOut, auth } = NextAuth({
    // Behind nginx reverse proxy (Docker), NextAuth v5 must be told to trust the
    // forwarded host/proto headers — otherwise SSO callbacks fail in production.
    // Equivalent to setting AUTH_TRUST_HOST=true in env.
    trustHost: true,
    // ── DEBUG: aktifkan untuk melihat detail error SSO di production log ──────
    // Hapus atau set false setelah masalah teridentifikasi
    logger: {
        error(error: Error) {
            const cause = (error as any).cause;
            console.error('[AUTH ERROR]', error.message);
            if (cause) {
                console.error('[AUTH CAUSE]', {
                    message: cause?.message,
                    code:    cause?.code,      // e.g. ECONNREFUSED, ENOTFOUND
                    errno:   cause?.errno,
                    address: cause?.address,   // IP yang dicoba dihubungi
                    port:    cause?.port,
                });
            }
            console.error('[AUTH STACK]', error.stack);
        },
        warn(code: string) {
            console.warn('[AUTH WARN]', code);
        },
        debug(message: string, metadata?: unknown) {
            if (process.env.NODE_ENV !== 'production') return; // skip di lokal
            console.debug('[AUTH DEBUG]', message, metadata);
        },
    },
    // ─────────────────────────────────────────────────────────────────────────
    providers: [
        CognitoProvider({
            clientId: process.env.COGNITO_CLIENT_ID!,
            clientSecret: process.env.COGNITO_CLIENT_SECRET!,
            issuer: process.env.COGNITO_ISSUER!,
            authorization: {
                params: {
                    prompt: "login",
                },
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 365 * 24 * 60 * 60, // 1 year
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        async jwt({ token, account, profile }) {
            // On initial sign-in, persist Cognito data into the JWT.
            // IMPORTANT: do NOT store id_token/access_token here. With the JWT
            // session strategy these are written into the (chunked) session
            // cookie; the Cognito tokens are large and blow past nginx's header
            // buffer, causing a 502 on the /callback response even though auth
            // succeeded. id_token is not needed (federated-logout doesn't use it).
            // If an ERP access_token is needed, fetch/mint it in a dedicated
            // server route instead of parking it in the auth cookie.
            if (account && profile) {
                token.sub = profile.sub ? String(profile.sub) : undefined;
                token.email = profile.email as string;
                token.name = (profile.name || profile.email) as string;
                token.provider = "cognito";
            }
            return token;
        },
        async session({ session, token }) {
            // Expose only lightweight user info to the client session.
            if (session.user) {
                session.user.id = token.sub as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
            }
            return session;
        },
        async signIn() {
            // Set a client-readable flag cookie so AuthStateSync can detect SSO login.
            // The NextAuth session cookie (authjs.session-token) is httpOnly and can't
            // be read via document.cookie, so we need this separate flag.
            try {
                const cookieStore = await cookies();
                cookieStore.set('sso_flag', '1', {
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 365 * 24 * 60 * 60, // 1 year
                    path: '/',
                });
            } catch {
                // cookies() may fail in edge runtime — non-critical
            }
            return true; // Allow sign-in
        },
    },
});
