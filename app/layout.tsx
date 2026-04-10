import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TabBar from "./components/TabBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Otoki",
  description: "Hear who's playing near you tonight.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta
          name="impact-site-verification"
          content="e6bc91a8-4bae-4db4-b05a-0e711987c47f"
        />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        {/* Main content — bottom padding reserves space for tab bar */}
        <div className="flex-1 pb-20">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
