"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@ticketforge/db";
import { sessionCookieName } from "@/lib/server/session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) {
    redirect("/login?error=missing-email");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/login?error=user-not-found");
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, user.email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  redirect("/login");
}
