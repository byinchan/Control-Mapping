import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DISCLAIMER, FICTIONAL_ORG_NOTE } from "@/lib/disclaimer.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control Mapping & Framework Alignment",
  description:
    "AI-assisted control mapping prototype for a fictional organization. AI suggests, code calculates, the analyst decides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-slate-200 px-4 py-4 text-xs text-slate-600">
            <div className="mx-auto max-w-5xl space-y-1">
              <p>{DISCLAIMER}</p>
              <p>{FICTIONAL_ORG_NOTE} AI-assisted, human-reviewed.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
