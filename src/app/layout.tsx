import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "TENGOK – Surveillance Integration System",
  description: "Sistem Integrasi Pengawasan CCTV – PT Brantas Abipraya",
  icons: {
    icon: "/abipraya_original.svg",
    shortcut: "/abipraya_original.svg",
    apple: "/abipraya_original.svg",
  },
};

// Script anti-flash: set kelas tema di <html> SEBELUM paint pertama,
// berdasarkan pilihan tersimpan atau preferensi OS (prefers-color-scheme).
const themeInitScript = `
(function(){
  try {
    var saved = localStorage.getItem('tengok-theme');
    var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var c = dark ? 'dark' : 'light';
    document.documentElement.classList.add(c);
    document.documentElement.style.colorScheme = c;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider>
          <Providers>
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
