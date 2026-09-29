import type { Metadata } from "next";

import { getSafeNext } from "@/modules/auth/auth.schema";
import { AuthScreen } from "@/modules/auth/components/AuthScreen";

export const metadata: Metadata = { title: "Iniciar sesión — Ticketera" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <AuthScreen mode="login" next={getSafeNext(next)} />;
}
