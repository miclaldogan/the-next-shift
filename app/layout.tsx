import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Next Shift",
  description:
    "A night janitor, four hours, and money left behind by the player before you. On-chain generosity, one shift at a time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
