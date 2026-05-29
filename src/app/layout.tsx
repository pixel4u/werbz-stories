import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "werbz Stories",
  description: "Standalone Stories platform for werbz.com",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
