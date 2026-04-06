import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { cookies } from "next/headers";

export const { handlers, signIn, signOut, auth } = NextAuth({
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
            // On initial sign-in, persist Cognito data into the JWT
            if (account && profile) {
                token.sub = profile.sub ? String(profile.sub) : undefined;
                token.email = profile.email as string;
                token.name = (profile.name || profile.email) as string;
                token.provider = "cognito";
                token.id_token = account.id_token; // Simpan id_token untuk logout
            }
            return token;
        },
        async session({ session, token }) {
            // Expose user info and tokens to the client session
            if (session.user) {
                session.user.id = token.sub as string;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                (session as any).id_token = token.id_token; // Kirim ke client session
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
