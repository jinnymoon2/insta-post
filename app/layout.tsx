import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InstaPost",
  description: "Generate Instagram carousel posts from links or long writing.",
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