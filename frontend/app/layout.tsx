import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { SyncProvider } from "@/context/SyncContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { SyncLiveModal } from "@/components/SyncLiveModal";

export const metadata: Metadata = {
  title: "Engineering Intelligence Platform — Searchable Engineering Memory",
  description:
    "AI-powered platform that converts GitHub engineering history into searchable Engineering Memory with evidence-backed Q&A.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SidebarProvider>
          <SyncProvider>
            <div className="app-layout">
              <Sidebar />
              <main className="main-content">{children}</main>
            </div>
            <SyncLiveModal />
          </SyncProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}
