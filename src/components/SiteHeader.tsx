import { Navbar } from "@/components/Navbar";
import { ImpersonationBanner } from "@/modules/user/components/ImpersonationBanner";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-background">
      <ImpersonationBanner />
      <Navbar />
    </header>
  );
}
