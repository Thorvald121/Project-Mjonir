import { cookies } from "next/headers";
import { prisma } from "@ticketforge/db";

const sessionCookieName = process.env.SESSION_COOKIE_NAME || "ticketforge_session";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const email = cookieStore.get(sessionCookieName)?.value;
  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
    include: { organization: true }
  });
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export { sessionCookieName };
