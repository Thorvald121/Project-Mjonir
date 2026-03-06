import Link from "next/link";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const message =
    params.error === "user-not-found"
      ? "User not found. Seed the demo users first."
      : params.error === "missing-email"
        ? "Enter an email to continue."
        : null;

  return (
    <div className="loginWrap card stack">
      <div>
        <p className="eyebrow">TicketForge</p>
        <h1>Demo sign in</h1>
        <p className="muted">Use a seeded email to create a local demo session cookie. This is temporary scaffolding, not final auth.</p>
      </div>
      {message ? <div className="pill pillDanger">{message}</div> : null}
      <form action={loginAction} className="form">
        <div className="formRow">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" placeholder="agent@ticketforge.local" required />
        </div>
        <button type="submit">Sign in</button>
      </form>
      <div className="muted">
        Seeded examples: <code>admin@ticketforge.local</code> and <code>agent@ticketforge.local</code>.
      </div>
      <Link href="/api/seed-demo">Need seed help?</Link>
    </div>
  );
}
