// Augmentasi tipe NextAuth: tambah `username` ke session user & JWT.
// `username` dipakai untuk mencocokkan PIC yang masih berformat placeholder
// `ldap_<username>` di Location.picSubs (lihat src/lib/apiAuth.ts).
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username?: string | null;
        } & DefaultSession['user'];
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        username?: string | null;
        provider?: string;
    }
}
