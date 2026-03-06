import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { logoutAction } from "@/app/login/actions";
import { getSessionUser } from "@/lib/server/session";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <Shell>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Workspace basics</h2>
        </div>
      </div>
      <div className="grid2">
        <article className="card stack">
          <div>
            <p className="muted">Organization</p>
            <strong>{user.organization.name}</strong>
          </div>
          <div>
            <p className="muted">Timezone</p>
            <strong>{user.organization.businessTimezone}</strong>
          </div>
          <div>
            <p className="muted">First response SLA</p>
            <strong>{user.organization.slaFirstResponseMins} minutes</strong>
          </div>
          <div>
            <p className="muted">Resolution SLA</p>
            <strong>{user.organization.slaResolutionMins} minutes</strong>
          </div>
        </article>
        <article className="card stack">
          <div>
            <p className="muted">Signed in as</p>
            <strong>{user.name}</strong>
            <div className="muted">{user.email}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit">Sign out</button>
          </form>
        </article>
      </div>
    </Shell>
  );
}
