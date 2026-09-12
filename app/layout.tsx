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
              <footer className="shrink-0 border-t border-[var(--line)] py-1.5 px-4 text-[10px] text-[var(--dim)] text-center">
                Football data by{' '}
                <a href="https://5dollarfootballapi.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--tx)]">
                  5DollarFootballAPI
                </a>
              </footer>
            </div>
          </div>
        </AuthGate>
        <Analytics />
      </body>
    </html>
  );
}