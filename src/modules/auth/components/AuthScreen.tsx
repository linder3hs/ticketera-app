"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ticket } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { getFieldErrors, loginSchema, registerSchema } from "@/modules/auth/auth.schema";
import { useAuthStore } from "@/modules/auth/auth.store";
import { GoogleSignInButton } from "@/modules/auth/components/GoogleSignInButton";
import { PasswordInput } from "@/modules/auth/components/PasswordInput";

type AuthMode = "login" | "register";

interface AuthScreenProps {
  mode: AuthMode;
  /** Where to go after signing in (a local path). */
  next: string;
}

const BRAND_IMAGE = {
  src: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80",
  alt: "Multitud con las manos en alto frente a un escenario con luces doradas durante un festival nocturno",
};

const COPY = {
  login: {
    title: "Hola de nuevo",
    subtitle: "Ingresa para ver tus entradas y comprar más rápido.",
    submit: "Iniciar sesión",
  },
  register: {
    title: "Crea tu cuenta",
    subtitle: "Guarda tus entradas y recibe novedades de tus eventos.",
    submit: "Crear cuenta",
  },
};

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const FIELD_ORDER = ["fullName", "email", "password", "acceptTerms"];

function Tabs({ mode, next }: { mode: AuthMode; next: string }) {
  const query = next === "/my-tickets" ? "" : `?next=${encodeURIComponent(next)}`;
  const tabs = [
    { mode: "login", label: "Iniciar sesión", href: `/login${query}` },
    { mode: "register", label: "Crear cuenta", href: `/register${query}` },
  ];

  return (
    <nav aria-label="Acceso" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
      {tabs.map((tab) => {
        const isActive = tab.mode === mode;
        return (
          <Link
            key={tab.mode}
            href={tab.href}
            replace
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center rounded-xl text-[15px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive ? "bg-background font-semibold shadow-[0_2px_8px_-4px_rgba(24,24,27,0.3)]" : "font-medium",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Sign-in and sign-up: brand panel plus the form of the active tab, with
 * "Continuar con Google" on top. The session is simulated (any valid data).
 */
export function AuthScreen({ mode, next }: AuthScreenProps) {
  const router = useRouter();
  const { login, register } = useAuthStore();
  const [values, setValues] = useState({ fullName: "", email: "", password: "", acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const copy = COPY[mode];
  const schema = mode === "login" ? loginSchema : registerSchema;

  const goNext = () => router.push(next);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    const nextValues = { ...values, [key]: value };
    setValues(nextValues);
    if (wasSubmitted) setErrors(getFieldErrors(schema, nextValues));
  }

  function fieldProps(field: string) {
    return {
      id: field,
      name: field,
      "aria-required": true,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWasSubmitted(true);
    const nextErrors = getFieldErrors(schema, values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    if (mode === "login") login(values.email);
    else register(values.fullName, values.email);
    goNext();
  }

  return (
    <div className="flex min-h-full flex-col lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
      <section className="relative flex h-[210px] shrink-0 flex-col justify-between overflow-hidden bg-indigo-950 p-4 text-white lg:h-auto lg:gap-8 lg:p-10">
        <Link
          href="/"
          className="relative z-10 flex w-fit items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60 lg:gap-2.5"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-white text-primary lg:size-[38px] lg:rounded-[11px]">
            <Ticket className="size-[17px] lg:size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight lg:text-[21px]">Ticketera</span>
        </Link>
        <div className="absolute inset-y-0 right-0 w-[170px] overflow-hidden rounded-bl-[40px] lg:relative lg:inset-auto lg:h-[440px] lg:w-full lg:rounded-[28px]">
          <Image src={BRAND_IMAGE.src} alt={BRAND_IMAGE.alt} fill priority sizes="(min-width: 1024px) 560px, 170px" className="object-cover" />
        </div>
        <div className="relative z-10 flex w-[190px] flex-col gap-1.5 lg:w-auto lg:gap-2.5">
          <p className="text-[22px] leading-tight font-bold tracking-tight lg:text-[34px]">Tus entradas, siempre a mano.</p>
          <p className="text-[13px] leading-snug text-indigo-200 lg:text-base">Compra en minutos y lleva tu QR en el celular.</p>
        </div>
      </section>

      <section className="flex flex-1 justify-center px-4 pt-6 pb-8 lg:items-center lg:py-12">
        <div className="flex w-full max-w-[440px] flex-col gap-6 lg:gap-7">
          <Tabs mode={mode} next={next} />

          <div className="flex flex-col gap-1 lg:gap-1.5">
            <h1 className="text-[26px] leading-tight font-bold tracking-tight lg:text-[30px]">{copy.title}</h1>
            <p className="text-sm text-muted-foreground lg:text-[15px]">{copy.subtitle}</p>
          </div>

          <GoogleSignInButton onSignedIn={goNext} />

          <div className="flex items-center gap-3 text-[13px] text-muted-foreground" role="separator">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />o con tu correo
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-[18px]">
            <p className="-mt-2 text-xs text-muted-foreground">
              Los campos con{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
              <span className="sr-only">asterisco</span> son obligatorios.
            </p>

            {mode === "register" && (
              <FormField id="fullName" label="Nombre completo" error={errors.fullName}>
                <Input
                  {...fieldProps("fullName")}
                  autoComplete="name"
                  placeholder="Tu nombre y apellido"
                  value={values.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
            )}

            <FormField id="email" label="Correo electrónico" error={errors.email}>
              <Input
                {...fieldProps("email")}
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                className={FIELD_CLASS}
              />
            </FormField>

            <FormField
              id="password"
              label="Contraseña"
              error={errors.password}
              labelAside={
                mode === "login" && (
                  <a href="#" className="text-sm font-semibold text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </a>
                )
              }
            >
              <PasswordInput
                {...fieldProps("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "Mínimo 8 caracteres" : undefined}
                value={values.password}
                onChange={(e) => update("password", e.target.value)}
                className={FIELD_CLASS}
              />
            </FormField>

            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-700">
                  <input
                    {...fieldProps("acceptTerms")}
                    type="checkbox"
                    checked={values.acceptTerms}
                    onChange={(e) => update("acceptTerms", e.target.checked)}
                    className="size-[22px] shrink-0 cursor-pointer accent-primary lg:size-5"
                  />
                  <span>
                    Acepto los{" "}
                    <a href="#" className="font-medium text-primary hover:underline">
                      Términos y condiciones
                    </a>
                    <span aria-hidden="true" className="ml-0.5 text-destructive">
                      *
                    </span>
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p id="acceptTerms-error" className="text-[13px] font-medium text-destructive">
                    {errors.acceptTerms}
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="mt-1.5 h-[54px] cursor-pointer rounded-2xl text-base font-semibold">
              {copy.submit}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
              <Link
                href={mode === "login" ? "/register" : "/login"}
                replace
                className="font-semibold text-primary hover:underline"
              >
                {mode === "login" ? "Crea una gratis" : "Inicia sesión"}
              </Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
