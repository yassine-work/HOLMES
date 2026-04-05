import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/providers/query-provider";
import { SoundProvider } from "@/providers/sound-provider";

import "./globals.css";

const headingFont = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: "400",
});

const bodyFont = VT323({
  subsets: ["latin"],
  variable: "--font-body",
  weight: "400",
});

export const metadata: Metadata = {
  title: "HOLMES | AI Verification Platform",
  description:
    "HOLMES helps citizens verify digital content with clear and explainable verdicts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <QueryProvider>
          <SoundProvider>
            <AppShell>{children}</AppShell>
          </SoundProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
