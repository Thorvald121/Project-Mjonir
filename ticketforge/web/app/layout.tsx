import "./globals.css";
import HeaderAuth from "@/components/HeaderAuth";
import Nav from "@/components/Nav";

export const metadata = { title: "TicketForge" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: "1px solid #1f1f2b", padding: "0.75rem 1rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Nav />
            <div><HeaderAuth /></div>
          </div>
        </header>
        <main style={{ padding: "1rem" }}>{children}</main>
      </body>
    </html>
  );
}
