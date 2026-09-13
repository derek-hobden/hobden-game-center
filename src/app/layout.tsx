import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import { ProfileProvider } from "@/context/profile-context";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Hobden Game Center",
    template: "%s · Hobden Game Center",
  },
  description:
    "Installable mini-games for Keira and Luke — same games, different themes.",
  applicationName: "Hobden Game Center",
  appleWebApp: {
    capable: true,
    title: "Hobden Game Center",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e0f2fe" },
    { media: "(prefers-color-scheme: dark)", color: "#0b2a3d" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fredoka.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ProfileProvider>
          {children}
          <PwaRegister />
        </ProfileProvider>
      </body>
    </html>
  );
}
