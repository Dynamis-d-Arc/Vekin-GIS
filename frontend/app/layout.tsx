import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vekin GIS Sentinel-2 Platform",
    template: "%s | Vekin GIS",
  },
  description: "Sentinel-2 vegetation, rainfall, elevation, and land context analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
