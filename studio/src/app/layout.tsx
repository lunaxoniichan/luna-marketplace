import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luna Studio",
  description: "Control plane for Luna Agent Kit knowledge",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
            <div>
              <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300 no-underline">
                Luna Studio
              </Link>
              <p className="mt-1 text-sm text-slate-400">
                Knowledge control plane · vault edit + sync (Phase 2)
              </p>
            </div>
            <nav className="flex gap-4 text-sm text-slate-300">
              <Link href="/">Overview</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
