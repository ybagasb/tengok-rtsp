"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import axios from 'axios';
import { Lock, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function LoginForm() {
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [ssoLoading, setSsoLoading] = useState(false);
    const router = useRouter();

    // 2d. Hangatkan (warm-up) chunk IntroScene3D dari halaman login
    useEffect(() => {
        try {
            void import('@/components/intro/IntroScene3D');
        } catch {
            // Abaikan kegagalan prefetch
        }
    }, []);

    const handlePinLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!pin) {
            toast.error('Please enter the access PIN');
            return;
        }

        setLoading(true);

        try {
            const res = await axios.post('/api/auth/verify', { pin });

            if (res.data.success) {
                toast.success('Access Granted');
                // Use full page navigation so middleware sees the new auth_token cookie
                window.location.href = '/categories';
            }
        } catch (error: any) {
            console.error(error);
            if (error.response?.status === 401) {
                toast.error('Invalid PIN');
            } else {
                toast.error('Login Error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCognitoLogin = async () => {
        setSsoLoading(true);
        try {
            await signIn('cognito', { callbackUrl: '/categories' }, { prompt: 'login' });
        } catch (error) {
            toast.error('SSO Login Error');
            setSsoLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
            {/* Background glow matching Abipraya yellow */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="z-10 w-full max-w-md p-8 bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
            >
                {/* Logo & Title */}
                <div className="flex flex-col items-center mb-8">
                    <img
                        src="/abipraya_original.svg"
                        alt="PT Brantas Abipraya"
                        className="w-20 h-20 object-contain mb-4 drop-shadow-[0_0_16px_rgba(254,213,51,0.5)]"
                    />
                    <h1 className="text-2xl font-bold tracking-wider bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent">
                        TENGOK
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Surveillance Integration System</p>
                    <p className="text-slate-600 text-xs mt-0.5 uppercase tracking-wider">PT Brantas Abipraya</p>
                </div>

                {/* SSO Login Button (Primary) */}
                <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCognitoLogin}
                    disabled={ssoLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 rounded-2xl transition-all shadow-[0_8px_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider mb-6"
                >
                    {ssoLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Redirecting...
                        </>
                    ) : (
                        <>
                            <ShieldCheck className="w-5 h-5" />
                            Login with SSO
                        </>
                    )}
                </motion.button>

                {/* Divider */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">atau PIN</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* PIN Login (Fallback) */}
                <form onSubmit={handlePinLogin} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Access PIN</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all text-center tracking-[0.5em] font-mono text-lg"
                                placeholder="••••••"
                                maxLength={6}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_30px_rgba(234,179,8,0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            'Masuk'
                        )}
                    </button>
                </form>

            </motion.div>
        </div>
    );
}
