"use client";

import { Toaster } from 'react-hot-toast';

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        background: '#334155',
                        color: '#fff',
                    }
                }}
            />
        </>
    );
}
