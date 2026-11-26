// Augmentasi tipe NextAuth: tambah `username`, `appRole`, `appDivisi` ke
// session user & JWT. `username` dipakai untuk mencocokkan PIC yang masih
// berformat placeholder `ldap_<username>` di Location.picSubs.
// `appRole` dan `appDivisi` dipakai untuk RBAC admin divisi.
import type { DefaultSession } from 'next-auth';
import type { AppRoleName, DivisiName } from '@/models/AppRole';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username?: string | null;
            appRole?: AppRoleName | null;
            appDivisi?: DivisiName | null;
        } & DefaultSession['user'];
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        username?: string | null;
        provider?: string;
        appRole?: AppRoleName | null;
        appDivisi?: DivisiName | null;
        roleSyncedAt?: number;
    }
}
