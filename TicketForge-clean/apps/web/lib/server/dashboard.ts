import { TicketStatus } from "@prisma/client";
import { prisma } from "@ticketforge/db";

export async function getDashboardStats(organizationId: string) {
  const [total, open, inProgress, waiting, resolved] = await Promise.all([
    prisma.ticket.count({ where: { organizationId } }),
    prisma.ticket.count({ where: { organizationId, status: TicketStatus.OPEN } }),
    prisma.ticket.count({ where: { organizationId, status: TicketStatus.IN_PROGRESS } }),
    prisma.ticket.count({ where: { organizationId, status: TicketStatus.WAITING_ON_CUSTOMER } }),
    prisma.ticket.count({ where: { organizationId, status: TicketStatus.RESOLVED } })
  ]);

  return { total, open, inProgress, waiting, resolved };
}
