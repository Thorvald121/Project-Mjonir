import { TicketPriority, TicketStatus, type Prisma } from "@prisma/client";
import { prisma } from "@ticketforge/db";
import { computeSlaState } from "./sla";

export async function listTickets(organizationId: string, filter?: string) {
  const where: Prisma.TicketWhereInput = { organizationId };

  if (filter === "open") {
    where.status = { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_ON_CUSTOMER] };
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      requester: true,
      assignee: true,
      contact: true,
      comments: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
  });

  return tickets.map((ticket) => ({
    ...ticket,
    sla: computeSlaState(ticket)
  }));
}

export async function getTicketById(ticketId: string, organizationId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId },
    include: {
      requester: true,
      assignee: true,
      contact: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      activities: { include: { actor: true }, orderBy: { createdAt: "desc" } },
      timeEntries: { include: { user: true }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!ticket) return null;

  return {
    ...ticket,
    sla: computeSlaState(ticket)
  };
}

export async function createTicket(input: {
  organizationId: string;
  requesterId?: string;
  contactId?: string;
  assigneeId?: string;
  title: string;
  description: string;
  priority: TicketPriority;
  source?: string;
}) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
  const lastTicket = await prisma.ticket.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true }
  });
  const nextTicketNumber = (lastTicket?.ticketNumber ?? 1000) + 1;

  const ticket = await prisma.ticket.create({
    data: {
      organizationId: input.organizationId,
      requesterId: input.requesterId,
      contactId: input.contactId,
      assigneeId: input.assigneeId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      source: input.source ?? "agent",
      ticketNumber: nextTicketNumber,
      firstResponseDueAt: new Date(Date.now() + org.slaFirstResponseMins * 60 * 1000),
      resolutionDueAt: new Date(Date.now() + org.slaResolutionMins * 60 * 1000)
    }
  });

  await prisma.ticketActivity.create({
    data: {
      ticketId: ticket.id,
      actorId: input.requesterId,
      type: "CREATED",
      message: `Ticket #${ticket.ticketNumber} created`
    }
  });

  return ticket;
}

export async function updateTicket(input: {
  ticketId: string;
  organizationId: string;
  actorId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string | null;
}) {
  const current = await prisma.ticket.findFirstOrThrow({
    where: { id: input.ticketId, organizationId: input.organizationId }
  });

  const updated = await prisma.ticket.update({
    where: { id: current.id },
    data: {
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
      firstRespondedAt:
        input.status && !current.firstRespondedAt && input.status !== TicketStatus.OPEN
          ? new Date()
          : current.firstRespondedAt,
      resolvedAt:
        input.status && [TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(input.status)
          ? new Date()
          : input.status === TicketStatus.OPEN
            ? null
            : current.resolvedAt
    }
  });

  const messages: string[] = [];
  if (input.status && input.status !== current.status) messages.push(`Status changed from ${current.status} to ${input.status}`);
  if (input.priority && input.priority !== current.priority) messages.push(`Priority changed from ${current.priority} to ${input.priority}`);
  if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) messages.push(input.assigneeId ? "Ticket reassigned" : "Ticket unassigned");

  if (messages.length > 0) {
    await prisma.ticketActivity.createMany({
      data: messages.map((message) => ({
        ticketId: current.id,
        actorId: input.actorId,
        type: "STATUS_CHANGED",
        message
      }))
    });
  }

  return updated;
}

export async function addComment(input: {
  ticketId: string;
  organizationId: string;
  authorId?: string;
  body: string;
  isInternal?: boolean;
}) {
  const ticket = await prisma.ticket.findFirstOrThrow({
    where: { id: input.ticketId, organizationId: input.organizationId }
  });

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: ticket.id,
      authorId: input.authorId,
      body: input.body,
      isInternal: input.isInternal ?? false
    },
    include: {
      author: true
    }
  });

  await prisma.ticketActivity.create({
    data: {
      ticketId: ticket.id,
      actorId: input.authorId,
      type: "COMMENTED",
      message: input.isInternal ? "Internal note added" : "Public reply added"
    }
  });

  return comment;
}

export async function addTimeEntry(input: {
  ticketId: string;
  organizationId: string;
  userId: string;
  minutes: number;
  notes?: string;
}) {
  const ticket = await prisma.ticket.findFirstOrThrow({
    where: { id: input.ticketId, organizationId: input.organizationId }
  });

  const entry = await prisma.timeEntry.create({
    data: {
      ticketId: ticket.id,
      userId: input.userId,
      minutes: input.minutes,
      notes: input.notes
    },
    include: { user: true }
  });

  await prisma.ticketActivity.create({
    data: {
      ticketId: ticket.id,
      actorId: input.userId,
      type: "TIME_LOGGED",
      message: `${input.minutes} minutes logged`
    }
  });

  return entry;
}
