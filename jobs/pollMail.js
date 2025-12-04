require("dotenv").config();
const Tickets = require("../lib/ticketStore.js");
const { sendTicketEmail } = require("../lib/email.js");
const { Client } = require("@microsoft/microsoft-graph-client");
const { TokenCredentialAuthenticationProvider } = require("@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

// -----------------------------
// Auth for Microsoft Graph
// -----------------------------
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ["https://graph.microsoft.com/.default"]
});

const client = Client.initWithMiddleware({ authProvider });

// -----------------------------
// Helpers
// -----------------------------
const extractTicketId = (subject) => {
  const match = subject?.match(/MBE-[A-Z0-9]{6}/i);
  return match ? match[0].toUpperCase() : null;
};

const stripTags = (html = "") =>
  String(html)
    .replace(/<\/?(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

const truncate = (txt = "", max = 500) =>
  txt.length > max ? txt.slice(0, max).trim() + "…" : txt;

/**
 * Simple branded HTML email template (inline CSS for client compatibility).
 * Pass HTML for messageHtml; everything else is plain strings.
 */
function emailTemplate({ heading, messageHtml, buttonHref, buttonText = "View Ticket", footerNote = "Notic Support Desk" }) {
  return `
  <div style="margin:0;padding:0;background:#f5f7fa;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e1e4e8;border-radius:10px;overflow:hidden;">
        <div style="background:#0F6CBD;color:#ffffff;padding:16px 20px;">
          <h1 style="margin:0;font:600 18px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            ${heading}
          </h1>
        </div>
        <div style="padding:20px;font:14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;">
          ${messageHtml}
          ${
            buttonHref
              ? `<div style="margin-top:18px;">
                  <a href="${buttonHref}" style="display:inline-block;background:#0F6CBD;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">
                    ${buttonText}
                  </a>
                 </div>`
              : ""
          }
          <p style="margin-top:24px;color:#667085;font-size:12px;">${footerNote}</p>
        </div>
      </div>
    </div>
  </div>`;
}

// -----------------------------
// Mailbox poller
// -----------------------------
async function pollMailbox() {
  try {
    const messages = await client
      .api(`/users/${process.env.HELPDESK_EMAIL}/mailFolders/inbox/messages`)
      .filter("isRead eq false")
      .top(10)
      .select("id,subject,body,from,receivedDateTime")
      .get();

    if (!messages.value.length) return;

    for (const msg of messages.value) {
      const from = msg.from?.emailAddress?.address;
      const subject = msg.subject || "(no subject)";
      const rawBody = msg.body?.content || "";
      // Try to give the ticket a clean, compact preview of the email
      const bodyText = truncate(stripTags(rawBody), 700);
      const ticketId = extractTicketId(subject);

      if (ticketId && Tickets.get(ticketId)) {
        // ✅ Existing ticket → append update
        const ticket = Tickets.get(ticketId);
        ticket.updates.push({
          at: new Date().toISOString(),
          text: `Email from ${from}: ${bodyText}`
        });
        Tickets.save(ticket);

        // ✅ Acknowledge with a nice HTML email containing a link
        const viewURL = `${process.env.BASE_URL}/tickets/${ticketId}`;
        const html = emailTemplate({
          heading: "Ticket Update Received",
          messageHtml: `
            <p>We've received your message regarding ticket <strong>${ticketId}</strong>.</p>
            ${
              bodyText
                ? `<div style="margin-top:10px;padding:12px;border-left:4px solid #0F6CBD;background:#F8FAFC;border-radius:6px;">
                     <div style="font-size:12px;color:#475467;margin-bottom:6px;">Your message</div>
                     <div style="white-space:pre-wrap;color:#111827;">${bodyText}</div>
                   </div>`
                : ""
            }
            <p style="margin-top:16px;">You can view the latest status at the link below:</p>
          `,
          buttonHref: viewURL,
          buttonText: "View Ticket",
          footerNote: "Thanks, Notic Support Desk"
        });

        await sendTicketEmail({
          useGraph: process.env.USE_GRAPH === "true",
          to: from,
          subject: `Re: ${ticketId} update received`,
          html,
          graph: {
            tenantId: process.env.AZURE_TENANT_ID,
            clientId: process.env.AZURE_CLIENT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
            sender: process.env.GRAPH_SENDER_UPN
          }
        });

      } else {
        // ✅ New ticket
        const id = "MBE-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const ticket = {
          id,
          name: from,
          issue: bodyText,
          created: new Date().toISOString(),
          updates: [],
          status: "Acknowledged"
        };
        Tickets.save(ticket);

        // ✅ Notify user with a nice HTML email & link
        const viewURL = `${process.env.BASE_URL}/tickets/${id}`;
        const html = emailTemplate({
          heading: "Ticket Created",
          messageHtml: `
            <p>Your support request has been logged.</p>
            <p style="margin-top:8px;"><strong>Ticket ID:</strong> ${id}</p>
            ${
              bodyText
                ? `<div style="margin-top:10px;padding:12px;border-left:4px solid #0F6CBD;background:#F8FAFC;border-radius:6px;">
                     <div style="font-size:12px;color:#475467;margin-bottom:6px;">Summary</div>
                     <div style="white-space:pre-wrap;color:#111827;">${bodyText}</div>
                   </div>`
                : ""
            }
            <p style="margin-top:16px;">You can view progress and replies here:</p>
          `,
          buttonHref: viewURL,
          buttonText: "View Ticket",
          footerNote: "We'll keep you updated — Notic Support Desk"
        });

        await sendTicketEmail({
          useGraph: process.env.USE_GRAPH === "true",
          to: from,
          subject: `Ticket created: ${id}`,
          html,
          graph: {
            tenantId: process.env.AZURE_TENANT_ID,
            clientId: process.env.AZURE_CLIENT_ID,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
            sender: process.env.GRAPH_SENDER_UPN
          }
        });
      }

      // ✅ Mark email as read (only after successful processing)
      await client
        .api(`/users/${process.env.HELPDESK_EMAIL}/messages/${msg.id}`)
        .patch({ isRead: true });
    }
  } catch (err) {
    console.error("Mail poll error:", err.message);
  }
}

module.exports = pollMailbox;