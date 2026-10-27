import type { EmailLayout, EmailTone } from "@/modules/email/email.types";

// Inline styles and tables only: email clients ignore stylesheets and most layout CSS.
const BRAND = "#4F46E5";
const TEXT = "#171717";
const MUTED = "#6B6B6B";
const BORDER = "#E5E5E5";
const BG = "#F5F5F5";
const FONT = "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', Menlo, Consolas, monospace";

const TONES: Record<EmailTone, { bg: string; fg: string }> = {
  brand: { bg: "#EEF2FF", fg: BRAND },
  success: { bg: "#ECFDF5", fg: "#047857" },
  warning: { bg: "#FFFBEB", fg: "#B45309" },
  danger: { bg: "#FEF2F2", fg: "#B91C1C" },
};

/** Escapes text for HTML content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function panelHtml({ heading, rows }: NonNullable<EmailLayout["panel"]>): string {
  const cells = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:4px 0;font-size:14px;color:${MUTED};width:110px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;font-size:14px;color:${TEXT};font-weight:600;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-radius:10px;margin-top:24px;">
    <tr><td style="padding:16px 20px;">
      <div style="font-size:16px;font-weight:700;color:${TEXT};padding-bottom:8px;">${escapeHtml(heading)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0">${cells}</table>
    </td></tr>
  </table>`;
}

function itemsHtml(items: EmailLayout["items"] = [], total?: EmailLayout["total"]): string {
  if (items.length === 0 && !total) return "";
  const cell = `padding:12px 0;border-top:1px solid ${BORDER};`;
  const rows = items
    .map(
      (item) => `<tr>
        <td style="${cell}">
          <div style="font-size:14px;font-weight:600;color:${TEXT};">${escapeHtml(item.title)}</div>
          <div style="font-size:13px;color:${MUTED};">${escapeHtml(item.subtitle)}</div>
        </td>
        <td align="right" style="${cell}font-family:${MONO};font-size:13px;color:${TEXT};">${escapeHtml(item.aside)}</td>
      </tr>`,
    )
    .join("");
  const totalRow = total
    ? `<tr>
        <td style="${cell}font-size:14px;font-weight:600;color:${TEXT};">${escapeHtml(total.label)}</td>
        <td align="right" style="${cell}font-size:16px;font-weight:700;color:${TEXT};">${escapeHtml(total.value)}</td>
      </tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">${rows}${totalRow}</table>`;
}

function ctaHtml(cta?: EmailLayout["cta"]): string {
  if (!cta) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
    <tr><td style="background:${BRAND};border-radius:10px;">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${escapeHtml(cta.label)}</a>
    </td></tr>
  </table>`;
}

function toHtml(layout: EmailLayout): string {
  const tone = TONES[layout.badge.tone];
  const paragraphs = layout.paragraphs
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(p)}</p>`)
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(layout.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};">
        <tr><td style="padding:0 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:36px;height:36px;background:${BRAND};border-radius:11px;text-align:center;vertical-align:middle;font-size:18px;line-height:36px;">🎟️</td>
            <td style="padding-left:10px;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.3px;">Ticketera</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;padding:32px;">
          <div style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;">${escapeHtml(layout.badge.label)}</div>
          <h1 style="margin:16px 0 12px;font-size:24px;line-height:1.3;color:${TEXT};">${escapeHtml(layout.title)}</h1>
          ${paragraphs}
          ${layout.panel ? panelHtml(layout.panel) : ""}
          ${itemsHtml(layout.items, layout.total)}
          ${ctaHtml(layout.cta)}
        </td></tr>
        <tr><td style="padding:24px 8px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
          ${escapeHtml(layout.footer)}<br>
          Este buzón no recibe respuestas.<br>
          © ${new Date().getFullYear()} Ticketera. Todos los derechos reservados.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function toText(layout: EmailLayout): string {
  const lines = ["Ticketera", "", layout.title, "", ...layout.paragraphs];
  if (layout.panel) lines.push("", layout.panel.heading, ...layout.panel.rows.map(([label, value]) => `${label}: ${value}`));
  if (layout.items?.length) lines.push("", ...layout.items.map((item) => `${item.title} · ${item.subtitle} — ${item.aside}`));
  if (layout.total) lines.push(`${layout.total.label}: ${layout.total.value}`);
  if (layout.cta) lines.push("", `${layout.cta.label}: ${layout.cta.url}`);
  lines.push("", layout.footer, "Este buzón no recibe respuestas.");
  return lines.join("\n");
}

/** The shared Ticketera look: logo, white card with a status badge, optional panel/items/button, footer. */
export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  return { html: toHtml(layout), text: toText(layout) };
}
