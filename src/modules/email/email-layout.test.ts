import { describe, expect, it } from "vitest";

import { escapeHtml, renderEmail } from "@/modules/email/email-layout";
import type { EmailLayout } from "@/modules/email/email.types";

const layout = (overrides: Partial<EmailLayout> = {}): EmailLayout => ({
  preheader: "Vista previa",
  badge: { label: "Compra confirmada", tone: "success" },
  title: "Tus entradas están listas",
  paragraphs: ["Hola Ana, tu compra se confirmó."],
  footer: "Recibiste este correo por tu compra en Ticketera.",
  ...overrides,
});

describe("escapeHtml", () => {
  it("escapes the HTML special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
});

describe("renderEmail", () => {
  it("escapes every dynamic value, including the button URL", () => {
    const { html } = renderEmail(
      layout({
        title: "<script>alert(1)</script>",
        panel: { heading: "Rock & Pop", rows: [["Lugar", "<b>Estadio</b>"]] },
        cta: { label: "Ver", url: `https://x.test/?a="><img src=x>` },
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Estadio</b>");
    expect(html).not.toContain(`"><img`);
    expect(html).toContain("Rock &amp; Pop");
  });

  it("leaves out the optional blocks when not given", () => {
    const { html } = renderEmail(layout());

    expect(html).not.toContain("<a href=");
    expect(html).toContain("Compra confirmada");
    expect(html).toContain("Este buzón no recibe respuestas.");
  });

  it("builds a plain-text version with the same content", () => {
    const { text } = renderEmail(
      layout({
        panel: { heading: "Rock Fest", rows: [["Pedido", "TK-1"]] },
        items: [{ title: "Platea", subtitle: "Fila A · 4", aside: "CODE-1" }],
        total: { label: "Total pagado", value: "S/ 90.00" },
        cta: { label: "Ver mis entradas", url: "https://x.test/my-tickets" },
      }),
    );

    expect(text).toContain("Tus entradas están listas");
    expect(text).toContain("Pedido: TK-1");
    expect(text).toContain("Platea · Fila A · 4 — CODE-1");
    expect(text).toContain("Total pagado: S/ 90.00");
    expect(text).toContain("Ver mis entradas: https://x.test/my-tickets");
  });
});
