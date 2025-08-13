import "./globals.css";
import Link from "next/link";

export const metadata = { title: "TicketForge" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>
      <header style={{borderBottom:"1px solid #1f1f2b", padding: "0.75rem 1rem"}}>
        <div className="row" style={{justifyContent:"space-between"}}>
          <div className="row" style={{gap:"1rem"}}>
            <Link href="/">TicketForge</Link>
            <Link href="/tickets">Tickets</Link>
            <Link href="/portal">Client Portal</Link>
          </div>
          <div><Link href="/auth/login">Login</Link></div>
        </div>
      </header>
      <main style={{padding:"1rem"}}>{children}</main>
    </body></html>
  );
}
