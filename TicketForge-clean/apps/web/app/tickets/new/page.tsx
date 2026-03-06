import { redirect } from "next/navigation";
import { prisma } from "@ticketforge/db";
import { Shell } from "@/components/Shell";
import { getSessionUser } from "@/lib/server/session";
import { TicketCreateForm } from "./ticket-create-form";

export default async function NewTicketPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [contacts, agents] = await Promise.all([
    prisma.contact.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } })
  ]);

  return (
    <Shell>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Create</p>
          <h2>New ticket</h2>
        </div>
      </div>
      <TicketCreateForm contacts={contacts} agents={agents} />
    </Shell>
  );
}
