import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import dbConnect from '@/lib/db';
import PinSession from '@/models/PinSession';
import LoginForm from './LoginForm';

export default async function LoginPage() {
    // 1. Cek sesi NextAuth (Cognito SSO)
    const session = await auth();
    if (session?.user) {
        redirect('/categories');
    }

    // 2. Cek sesi PIN yang masih aktif di database
    // (JANGAN redirect hanya karena cookie ada, harus valid di PinSession agar tidak loop)
    const cookieStore = await cookies();
    const pinToken = cookieStore.get('auth_token')?.value;
    let pinLive = false;
    if (pinToken) {
        try {
            await dbConnect();
            const live = await PinSession.exists({
                token: pinToken,
                expiresAt: { $gt: new Date() },
            });
            pinLive = Boolean(live);
        } catch {
            // Jika DB error, biarkan user tetap melihat form login
        }
    }

    if (pinLive) {
        redirect('/categories');
    }

    return <LoginForm />;
}

