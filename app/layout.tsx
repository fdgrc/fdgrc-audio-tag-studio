import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fdgrc Tag Studio",
  description: "Privacy-first MP3 metadata, Smart Fix, batch editing, lyrics, and cover art tools",
};

const themeBootScript = `
(() => {
  try {
    const saved = localStorage.getItem("fdgrc-tag-studio-theme");
    const theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "system";
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
