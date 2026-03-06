import { NextResponse } from "next/server";
import { z } from "zod";
import { TicketPriority } from "@prisma/client";
import { requireSessionUser } from "@/lib/server/session";
import { createTicket, listTickets } from "@/lib/server/tickets";

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
  contactId: z.string().cuid().optional().or(z.literal("")),
  assigneeId: z.string().cuid().optional().or(z.literal(""))
});

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const tickets = await listTickets(user.organizationId, url.searchParams.get("filter") ?? undefined);
    return NextResponse.json(tickets);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list tickets" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const json = await request.json();
    const input = createSchema.parse(json);
    const ticket = await createTicket({
      organizationId: user.organizationId,
      requesterId: user.id,
      title: input.title,
      description: input.description,
      priority: input.priority,
      contactId: input.contactId || undefined,
      assigneeId: input.assigneeId || undefined
    });
    return NextResponse.json({ id: ticket.id, ticketNumber: ticket.ticketNumber }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create ticket" }, { status: 400 });
  }
}
