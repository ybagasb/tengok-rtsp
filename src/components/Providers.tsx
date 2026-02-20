"use client";

import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { Toaster } from 'react-hot-toast';

export default function Providers({ children }: { children: React.ReactNode }) {
    const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

    return (
        <GoogleReCaptchaProvider
            reCaptchaKey={recaptchaKey ?? ''}
            scriptProps={{
                async: false,
                defer: false,
                appendTo: 'head',
                nonce: undefined,
            }}
        >
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
    );
}
