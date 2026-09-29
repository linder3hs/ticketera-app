import { Logo } from "@/components/Logo";

const FOOTER_COLUMNS = [
  {
    title: "Compañía",
    links: ["Sobre nosotros", "Empleo", "Prensa", "Blog"],
  },
  {
    title: "Ayuda",
    links: ["Centro de ayuda", "Contacto", "Cómo comprar", "Reembolsos"],
  },
  {
    title: "Legal",
    links: ["Términos y condiciones", "Privacidad", "Cookies"],
  },
  {
    title: "Síguenos",
    links: ["Instagram", "Facebook", "X (Twitter)", "TikTok"],
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-100 bg-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 pt-9 pb-7 md:px-6 lg:gap-12 lg:pt-16 lg:pb-10">
        <div className="flex flex-col gap-7 lg:flex-row lg:justify-between lg:gap-12">
          <div className="flex max-w-[300px] flex-col gap-3">
            <Logo />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Entradas para conciertos, deportes, teatro y festivales.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-4 lg:gap-14">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {column.title}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="rounded-lg text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="border-t border-border pt-5 text-xs text-muted-foreground lg:pt-6 lg:text-[13px]">
          © {currentYear} Ticketera. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
