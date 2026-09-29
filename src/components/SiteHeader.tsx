import { Navbar } from "@/components/Navbar";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-background">
      <Navbar />
    </header>
  );
}
