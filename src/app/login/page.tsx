"use client";

import { useState } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Lock, ShieldCheck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const { executeRecaptcha } = useGoogleReCaptcha();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin) return;

        if (!executeRecaptcha) {
            toast.error('Recaptcha not ready');
            return;
        }

        setLoading(true);

        try {
            const token = await executeRecaptcha('login');

            const res = await axios.post('/api/auth/verify', {
                pin,
                recaptchaToken: token
            });

            if (res.data.success) {
                toast.success('Access Granted');
                router.push('/');
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
                        src="/abipraya_original.svg"
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
                        disabled={loading || !executeRecaptcha}
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

                <p className="text-center text-xs text-slate-600 mt-8">
                    Protected by reCAPTCHA –&nbsp;
                    <a href="https://policies.google.com/privacy" className="text-yellow-600 hover:underline">Privacy</a>
                    &nbsp;&amp;&nbsp;
                    <a href="https://policies.google.com/terms" className="text-yellow-600 hover:underline">Terms</a>
                </p>
            </div>
        </div>
    );
}
