import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/providers/player-provider";

export const metadata: Metadata = {
  title: "VOID",
  description: "VOID music streaming MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <PlayerProvider>
          <div className="flex min-h-screen bg-background">
            <Sidebar />
            <div className="flex min-h-screen flex-1 flex-col">
              <Topbar />
              <main className="flex-1 px-6 py-8">{children}</main>
              <PlayerBar />
            </div>
          </div>
        </PlayerProvider>
      </body>
    </html>
  );
}
