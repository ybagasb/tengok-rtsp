"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Lock, ShieldCheck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

export default function LoginPage() {
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const { executeRecaptcha } = useGoogleReCaptcha();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!pin) {
            toast.error('Please enter the access PIN');
            return;
        }

        let token = null;

        if (process.env.NODE_ENV === 'production') {
            if (!executeRecaptcha) {
                toast.error('Gagal memuat reCAPTCHA');
                return;
            }
            token = await executeRecaptcha('login');
            if (!token) {
                toast.error('Mohon selesaikan verifikasi reCAPTCHA');
                return;
            }
        }

        setLoading(true);

        try {
            const res = await axios.post('/api/auth/verify', {
                pin,
                recaptchaToken: token
            });

            if (res.data.success) {
                toast.success('Access Granted');
                router.push('/categories');
            }
        } catch (error: any) {
            console.error(error);
            if (error.response?.status === 401) {
                toast.error('Invalid PIN');
            } else if (error.response?.status === 403) {
                toast.error('Verification Failed (Bot detected)');
            } else {
                toast.error('Login Error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
            {/* Background glow matching Abipraya yellow */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-[120px]" />

            <div className="z-10 w-full max-w-md p-8 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
                {/* Logo & Title */}
                <div className="flex flex-col items-center mb-8">
                    <img
                        src="https://brantas-abipraya.co.id/sites/default/files/LOGO%20ABIPRAYA%20%281%29_1.png"
                        alt="PT Brantas Abipraya"
                        className="w-20 h-20 object-contain mb-4 drop-shadow-[0_0_16px_rgba(254,213,51,0.5)]"
                    />
                    <h1 className="text-2xl font-bold tracking-widest bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent">
                        TENGOK
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Surveillance Integration System</p>
                    <p className="text-slate-600 text-xs mt-0.5 uppercase tracking-widest">PT Brantas Abipraya</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
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

            </div>
        </div>
    );
}
