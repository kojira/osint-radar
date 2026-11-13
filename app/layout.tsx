import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIGNAL / OSINT Radar",
  description: "公開情報から、確かな判断へ。テーマ・情報源・証拠をつなぐプライベートOSINTワークスペース。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
