const SECTIONS = [
  {
    title: "Evento cancelado",
    body: [
      "Si un evento se cancela, te reembolsamos el 100 % de lo que pagaste. El reembolso es automático: no tienes que pedirlo.",
      'Puedes ver el estado de tu reembolso en "Mis entradas".',
    ],
  },
  {
    title: "Evento reprogramado",
    body: [
      "Tu entrada sigue siendo válida para la nueva fecha. Si no puedes asistir, puedes solicitar el reembolso dentro del plazo que se comunique al reprogramar el evento.",
    ],
  },
  {
    title: "Compra duplicada o error de cobro",
    body: ["Si se te cobró de más o se duplicó una compra, reembolsamos el cobro correspondiente tras verificar el caso."],
  },
  {
    title: "Ventana de solicitud",
    body: [
      "Puedes solicitar el reembolso de entradas válidas hasta 48 horas antes del inicio del evento. Se reembolsa el precio de las entradas.",
    ],
  },
  {
    title: "Casos no reembolsables",
    body: ["No se reembolsan:"],
    items: [
      "La pérdida o extravío de la entrada.",
      "La no asistencia al evento.",
      "Las entradas ya usadas (con check-in realizado).",
      "Las solicitudes fuera de la ventana de solicitud.",
    ],
  },
  {
    title: "Forma y plazos de acreditación",
    body: [
      "El reembolso vuelve a la forma de pago original. La acreditación depende de tu banco emisor: normalmente se ve entre 5 y 10 días hábiles después de que se procesa.",
    ],
  },
  {
    title: "Disponibilidad",
    body: [
      "La solicitud de reembolso a pedido todavía no está disponible en la plataforma; se habilitará más adelante. Por ahora, solo el reembolso por evento cancelado es automático.",
    ],
  },
];

/** Static refund policy: reasons, request window and credit times. */
export function RefundPolicy() {
  return (
    <article className="flex flex-col gap-8 rounded-3xl border border-border bg-card px-5 py-8 lg:rounded-[28px] lg:px-10 lg:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Política de reembolsos</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Así funcionan los reembolsos de tus entradas en Ticketera.
        </p>
      </header>

      {SECTIONS.map((section, index) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold lg:text-xl">
            {index + 1}. {section.title}
          </h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-[15px] leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-muted-foreground">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
