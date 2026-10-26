import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "TENGOK – Surveillance Integration System",
  description: "Sistem Integrasi Pengawasan CCTV – PT Brantas Abipraya",
  icons: {
    icon: "/abipraya_original.svg",
    shortcut: "/abipraya_original.svg",
    apple: "/abipraya_original.svg",
  },
};

// viewport-fit=cover mengaktifkan env(safe-area-inset-*) di iPhone berponi.
// theme-color per skema warna; ThemeProvider menyinkronkannya saat pengguna
// memilih tema manual.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

// Script anti-flash: set kelas tema di <html> SEBELUM paint pertama,
// berdasarkan pilihan tersimpan atau preferensi OS (prefers-color-scheme).
const themeInitScript = `
(function(){
  try {
    var saved = localStorage.getItem('tengok-theme');
    var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var c = dark ? 'dark' : 'light';
    var d = document.documentElement;
    d.classList.add(c);
    d.style.colorScheme = c;
    var color = dark ? '#0f172a' : '#f1f5f9';
    var m = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < m.length; i++) m[i].setAttribute('content', color);
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
    <html
      lang="id"
      className={`${inter.variable}`}
      suppressHydrationWarning
    >
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
