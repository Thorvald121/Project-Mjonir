import pkg from "@prisma/client";
const { PrismaClient } = pkg as typeof import("@prisma/client");
export const prisma = new PrismaClient();
