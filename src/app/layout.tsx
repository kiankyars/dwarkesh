import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dwarkesh Podcast RAG",
  description:
    "Search and chat across Dwarkesh Patel's podcast transcripts with source-backed answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
