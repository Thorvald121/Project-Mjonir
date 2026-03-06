import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/server/session";
import { addTimeEntry } from "@/lib/server/tickets";

const schema = z.object({
  ticketId: z.string().cuid(),
  minutes: z.number().int().positive(),
  notes: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const input = schema.parse(await request.json());
    const entry = await addTimeEntry({
      ticketId: input.ticketId,
      organizationId: user.organizationId,
      userId: user.id,
      minutes: input.minutes,
      notes: input.notes
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add time entry" }, { status: 400 });
  }
}
