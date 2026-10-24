"use client";

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Global error:', error);
    }, [error]);

    return (
        <html lang="id">
            <head>
                <title>Gangguan Sistem — Tengok Monitoring</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="color-scheme" content="light dark" />
                <style dangerouslySetInnerHTML={{ __html: `
                    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
                        background: #020617;
                        color: #e2e8f0;
                        min-height: 100vh;
                        min-height: 100dvh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                    }
                    .glow-1 {
                        position: fixed; width: 500px; height: 500px;
                        background: rgba(239, 68, 68, 0.06); border-radius: 50%;
                        filter: blur(120px); top: -10%; left: -10%;
                        animation: float 8s ease-in-out infinite;
                    }
                    .glow-2 {
                        position: fixed; width: 400px; height: 400px;
                        background: rgba(249, 115, 22, 0.05); border-radius: 50%;
                        filter: blur(120px); bottom: -15%; right: -10%;
                        animation: float 8s ease-in-out infinite reverse;
                    }
                    @keyframes float {
                        0%, 100% { transform: translate(0, 0) scale(1); }
                        50% { transform: translate(20px, -15px) scale(1.05); }
                    }
                    .container {
                        position: relative; z-index: 10; text-align: center;
                        max-width: 480px; padding: 2rem;
                    }
                    .icon-wrap {
                        width: 112px; height: 112px; margin: 0 auto 2.5rem;
                        border-radius: 2.5rem; background: rgba(239, 68, 68, 0.08);
                        border: 1px solid rgba(239, 68, 68, 0.15);
                        display: flex; align-items: center; justify-content: center;
                        animation: breathe 3s ease-in-out infinite;
                    }
                    @keyframes breathe {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.04); }
                    }
                    h1 {
                        font-size: 2rem; font-weight: 800; letter-spacing: -0.02em;
                        margin-bottom: 0.75rem;
                        background: linear-gradient(135deg, #fca5a5, #ef4444, #dc2626);
                        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
                    }
                    .sub { font-size: 0.875rem; color: #64748b; line-height: 1.7; margin-bottom: 2.5rem; }
                    .btn {
                        display: inline-flex; align-items: center; gap: 8px;
                        padding: 14px 32px; border: none; border-radius: 1rem;
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        color: white; font-size: 0.875rem; font-weight: 700;
                        text-transform: uppercase; letter-spacing: 0.05em;
                        cursor: pointer; transition: all 0.3s;
                        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
                    }
                    .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4); }
                    .btn:active { transform: scale(0.97); }
                    .footer {
                        margin-top: 3rem; display: flex; align-items: center;
                        justify-content: center; gap: 12px; opacity: 0.3;
                    }
                    .footer img { height: 18px; }
                    .footer span { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: #64748b; }
                    .footer-div { width: 1px; height: 14px; background: rgba(255,255,255,0.2); }
                    /* Tema terang mengikuti preferensi OS (halaman ini di luar ThemeProvider). */
                    @media (prefers-color-scheme: light) {
                        body { background: #f1f5f9; color: #0f172a; }
                        .sub { color: #475569; }
                        .footer span { color: #475569; }
                        .footer { opacity: 0.6; }
                        .footer-div { background: rgba(15,23,42,0.25); }
                        h1 { background: linear-gradient(135deg, #dc2626, #b91c1c); -webkit-background-clip: text; background-clip: text; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        *, *::before, *::after { animation: none !important; transition: none !important; }
                    }
                ` }} />
            </head>
            <body>
                <div className="glow-1" />
                <div className="glow-2" />

                <div className="container">
                    <div className="icon-wrap">
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                            <path d="M12 9v4" />
                            <path d="M12 17h.01" />
                        </svg>
                    </div>

                    <h1>Terjadi Gangguan</h1>
                    <p className="sub">
                        Sistem mengalami gangguan sementara. Tim teknis kami sudah mengetahui masalah ini
                        dan sedang bekerja untuk menyelesaikannya.
                    </p>

                    <button className="btn" onClick={() => reset()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                        </svg>
                        Coba Lagi
                    </button>

                    <div className="footer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image; global-error merender di luar layout */}
                        <img src="/abipraya_original.svg" alt="Logo" />
                        <div className="footer-div" />
                        <span>Tengok Monitoring</span>
                    </div>
                </div>
            </body>
        </html>
    );
}
