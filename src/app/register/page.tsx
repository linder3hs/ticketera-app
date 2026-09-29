import type { Metadata } from "next";

import { getSafeNext } from "@/modules/auth/auth.schema";
import { AuthScreen } from "@/modules/auth/components/AuthScreen";

export const metadata: Metadata = { title: "Crear cuenta — Ticketera" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next } = await searchParams;
  return <AuthScreen mode="register" next={getSafeNext(next)} />;
}
