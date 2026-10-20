import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://chalkmind.app"),
  title: { default: "Chalkmind — Think it. See it. Understand it.", template: "%s · Chalkmind" },
  description: "Your personal AI tutor with an interactive whiteboard. Ask by voice or text, watch explanations unfold step by step, then practise until it clicks.",
  applicationName: "Chalkmind",
  openGraph: {
    title: "Chalkmind",
    description: "Your personal AI tutor with an interactive whiteboard.",
    url: "https://chalkmind.app",
    siteName: "Chalkmind",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

// Applies the saved (or system) theme before first paint — no flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cm-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Script id="cm-theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
