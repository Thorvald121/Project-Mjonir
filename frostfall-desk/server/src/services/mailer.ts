import nodemailer from "nodemailer";

const host = process.env.MAIL_HOST || "localhost";
const port = parseInt(process.env.MAIL_PORT || "1025", 10);
const from = process.env.MAIL_FROM || "desk@example.com";

export const mailer = nodemailer.createTransport({ host, port });

export async function sendMail(to: string, subject: string, html: string) {
  await mailer.sendMail({ from, to, subject, html });
}
