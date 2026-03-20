import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RMR Golf League",
  description: "Golf league management — leaderboards, score entry, and player profiles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${geistMono.variable} min-h-[100dvh] overflow-x-hidden bg-gray-100 text-gray-900 antialiased`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
