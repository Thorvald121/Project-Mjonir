import { prisma } from "../src/index";
import { Role, TicketPriority, TicketStatus } from "@prisma/client";

async function main() {
  const organization = await prisma.organization.upsert({
    where: { domain: "ticketforge.local" },
    update: {},
    create: {
      name: "TicketForge Demo",
      domain: "ticketforge.local",
      slaFirstResponseMins: 60,
      slaResolutionMins: 480
    }
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@ticketforge.local" },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Vlad Admin",
      email: "admin@ticketforge.local",
      role: Role.ADMIN
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@ticketforge.local" },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Casey Agent",
      email: "agent@ticketforge.local",
      role: Role.AGENT
    }
  });

  const contact = await prisma.contact.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: "ops@northwind.example"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Northwind Ops",
      email: "ops@northwind.example",
      company: "Northwind"
    }
  });

  const existing = await prisma.ticket.findFirst({ where: { organizationId: organization.id } });
  if (!existing) {
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: organization.id,
        requesterId: admin.id,
        assigneeId: agent.id,
        contactId: contact.id,
        ticketNumber: 1001,
        title: "Printer queue is stuck",
        description: "Users cannot print to the front office copier after the latest Windows update.",
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        source: "portal",
        firstResponseDueAt: new Date(Date.now() + 60 * 60 * 1000),
        resolutionDueAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
      }
    });

    await prisma.ticketComment.createMany({
      data: [
        {
          ticketId: ticket.id,
          authorId: admin.id,
          body: "Initial report from the front desk. Three users affected.",
          isInternal: false
        },
        {
          ticketId: ticket.id,
          authorId: agent.id,
          body: "Investigating spooler state and recent patch history.",
          isInternal: true
        }
      ]
    });

    await prisma.ticketActivity.createMany({
      data: [
        {
          ticketId: ticket.id,
          actorId: admin.id,
          type: "CREATED",
          message: "Ticket created from portal"
        },
        {
          ticketId: ticket.id,
          actorId: agent.id,
          type: "ASSIGNED",
          message: "Assigned to Casey Agent"
        }
      ]
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
