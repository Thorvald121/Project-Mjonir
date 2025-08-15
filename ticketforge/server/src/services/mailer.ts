import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "localhost";
const SMTP_PORT = Number(process.env.SMTP_PORT || 1025); // MailHog default
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_EMAIL = process.env.MAIL_FROM || "TicketForge <no-reply@ticketforge.local>";
const REPLY_DOMAIN = process.env.MAIL_REPLY_DOMAIN || "ticketforge.local";

// Transport: SMTP if configured (MailHog works with host: localhost, port: 1025, no auth)
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

// Keep the legacy helper so existing code won't break if it still calls sendMail directly.
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  opts?: { text?: string; replyTo?: string; headers?: Record<string, string> }
) {
  const info = await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text: opts?.text,
    replyTo: opts?.replyTo,
    headers: opts?.headers,
  });
  // eslint-disable-next-line no-console
  console.log("Mail sent:", info.messageId, "->", to, subject);
}

export function replyToForTicket(ticketId: string) {
  // In production, point this to an inbox you process (e.g., via webhook).
  // For dev with MailHog, it's just a helpful header value.
  return `reply+ticket-${ticketId}@${REPLY_DOMAIN}`;
}

/* ------------------------------------------------------------------ */
/*                         Templated emails                            */
/* ------------------------------------------------------------------ */

export type EmailKind = "ticket_comment" | "ticket_assigned" | "ticket_created" | "invoice_ready";

type Rendered = { subject: string; html: string; text: string };

function layout(title: string, bodyHtml: string) {
  // Minimal inline-styled HTML that renders nicely in most clients.
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0f1115;color:#e6e6e6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1115;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#171923;border:1px solid #272b38;border-radius:12px;overflow:hidden">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #272b38">
            <div style="font-weight:700;font-size:18px;color:#ffffff">TicketForge</div>
            <div style="opacity:.7;font-size:13px">${title}</div>
          </td></tr>
          <tr><td style="padding:20px 24px;line-height:1.5;color:#e6e6e6">
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:12px 24px;border-top:1px solid #272b38;color:#9aa4b2;font-size:12px">
            This is an automated message from TicketForge.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
  `.trim();
}

function esc(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function render(kind: EmailKind, data: any): Rendered {
  switch (kind) {
    case "ticket_created": {
      const subj = `New ticket: ${data.title}`;
      const html = layout("New ticket created", `
        <p><b>${esc(data.title)}</b></p>
        <p>${esc(data.description || "")}</p>
        <p>Status: <b>${esc(data.status)}</b> • Priority: <b>${esc(data.priority)}</b></p>
        <p><a href="${esc(data.link)}" style="color:#7cd4ff">Open ticket</a></p>
      `);
      const text = `New ticket: ${data.title}\n\n${data.description || ""}\n\nOpen: ${data.link}`;
      return { subject: subj, html, text };
    }
    case "ticket_assigned": {
      const subj = `Assigned: ${data.title}`;
      const html = layout("You were assigned a ticket", `
        <p><b>${esc(data.title)}</b></p>
        <p>Status: <b>${esc(data.status)}</b> • Priority: <b>${esc(data.priority)}</b></p>
        <p><a href="${esc(data.link)}" style="color:#7cd4ff">Open ticket</a></p>
      `);
      const text = `Assigned: ${data.title}\nOpen: ${data.link}`;
      return { subject: subj, html, text };
    }
    case "ticket_comment": {
      const subj = `New comment on: ${data.title}`;
      const html = layout("New ticket comment", `
        <p><b>${esc(data.title)}</b></p>
        <div style="border-left:3px solid #2b3444;padding-left:12px;margin:8px 0">${esc(data.comment)}</div>
        <p><a href="${esc(data.link)}" style="color:#7cd4ff">Reply in TicketForge</a></p>
      `);
      const text = `New comment on: ${data.title}\n\n${data.comment}\n\nReply: ${data.link}`;
      return { subject: subj, html, text };
    }
    case "invoice_ready": {
      const subj = `Invoice ready: ${data.number || data.period}`;
      const html = layout("Invoice is ready", `
        <p>Total: <b>${esc(data.total)}</b></p>
        <p>Period: ${esc(data.period)}</p>
        <p><a href="${esc(data.link)}" style="color:#7cd4ff">View invoice</a></p>
      `);
      const text = `Invoice ready: ${data.total}\nPeriod: ${data.period}\n${data.link}`;
      return { subject: subj, html, text };
    }
  }
}

export async function sendTemplated(
  kind: EmailKind,
  to: string,
  data: any,
  opts?: { replyTo?: string; headers?: Record<string, string> }
) {
  const { subject, html, text } = render(kind, data);
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
    replyTo: opts?.replyTo,
    headers: opts?.headers,
  });
}
