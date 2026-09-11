import "./globals.css";
import "./theme.css";
import AuthGate from "@/components/AuthGate";
import TopBar from "@/components/TopBar";
import SideNav from "@/components/SideNav";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen">
        <AuthGate>
          <div className="flex h-screen">
            <SideNav />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        </AuthGate>
        <Analytics />
      </body>
    </html>
  );
}