import { NextResponse } from "next/server";
import { z } from "zod";
import { TicketPriority, TicketStatus } from "@prisma/client";
import { requireSessionUser } from "@/lib/server/session";
import { getTicketById, updateTicket } from "@/lib/server/tickets";

const patchSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z.string().cuid().nullable().optional()
});

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const ticket = await getTicketById(id, user.organizationId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load ticket" }, { status: 401 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const json = await request.json();
    const input = patchSchema.parse(json);
    const { id } = await context.params;
    const ticket = await updateTicket({
      ticketId: id,
      organizationId: user.organizationId,
      actorId: user.id,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId
    });
    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update ticket" }, { status: 400 });
  }
}
