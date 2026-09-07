import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fdgrc Tag Studio",
  description: "Privacy-first MP3 metadata and cover art editor",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
