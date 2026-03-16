import type { Metadata } from "next";
import { Inter, Courier_Prime } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const courier = Courier_Prime({
  variable: "--font-typewriter",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CapturePilot - Government Contract Matching for Small Business",
  description: "Find government contracts that fit your business. 15+ criteria matching engine built for Veteran-Owned and Small Businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${courier.variable} font-sans antialiased bg-stone-50 text-stone-900`}
      >
        {children}
      </body>
    </html>
  );
}
