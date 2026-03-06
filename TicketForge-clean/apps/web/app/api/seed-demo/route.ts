import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const cwd = process.cwd();
    await execFileAsync("pnpm", ["--filter", "@ticketforge/db", "db:seed"], { cwd });
    return NextResponse.json({ ok: true, message: "Seed completed" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Seed failed. Run pnpm db:seed from the repo root." },
      { status: 500 }
    );
  }
}
