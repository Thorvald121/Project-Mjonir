import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/server/session";
import { addComment } from "@/lib/server/tickets";

const schema = z.object({
  ticketId: z.string().cuid(),
  body: z.string().min(1),
  isInternal: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const input = schema.parse(await request.json());
    const comment = await addComment({
      ticketId: input.ticketId,
      organizationId: user.organizationId,
      authorId: user.id,
      body: input.body,
      isInternal: input.isInternal
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add comment" }, { status: 400 });
  }
}
