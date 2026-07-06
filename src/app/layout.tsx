import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS Visual Weaver — Governed Visual Creation Pipeline",
  description:
    "FLUX.1 image generation studio with calibrated quality presets, curated HF/Civitai LoRA library, NSFW 18+ safety gating, and EU-compliant legal policy. Multi-agent pipeline: FLUX → ST3GG → MiniCPM-V → Nemotron.",
  keywords: [
    "NEXUS",
    "FLUX.1",
    "image generation",
    "LoRA",
    "HuggingFace",
    "Civitai",
    "AI safety",
    "EU AI Act",
  ],
  authors: [{ name: "NEXUS Visual Weaver" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
