"use client";

import { Toaster } from 'react-hot-toast';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            <GoogleReCaptchaProvider reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ''}>
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
            </GoogleReCaptchaProvider>
        </>
    );
}
