import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "TENGOK – Surveillance Integration System",
  description: "Sistem Integrasi Pengawasan CCTV – PT Brantas Abipraya",
  icons: {
    icon: "/abipraya_original.svg",
    shortcut: "/abipraya_original.svg",
    apple: "/abipraya_original.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
