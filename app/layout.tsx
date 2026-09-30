import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--serif" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--sans" });

export const metadata: Metadata = {
  title: "PhytoAtlas — Explore every plant through AI",
  description: "Photograph a plant. Get an identity, a health reading and a dated record that shows how it changes.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F6F7F3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
