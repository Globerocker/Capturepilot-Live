import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quick Company Check",
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
