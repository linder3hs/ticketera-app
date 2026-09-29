"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/modules/auth/auth.store";

interface GoogleSignInButtonProps {
  onSignedIn: () => void;
}

/** Google's "G" logo, in its brand colors. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Simulated delay of the Google consent popup. */
const MOCK_OAUTH_MS = 700;

/**
 * "Continuar con Google", following Google's button guidelines (white,
 * bordered, logo on the left). Simulated: signs into a mock Google account.
 */
export function GoogleSignInButton({ onSignedIn }: GoogleSignInButtonProps) {
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [isLoading, setIsLoading] = useState(false);

  function handleClick() {
    setIsLoading(true);
    setTimeout(() => {
      loginWithGoogle();
      onSignedIn();
    }, MOCK_OAUTH_MS);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
      className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border border-zinc-300 bg-white px-4 text-[15px] font-medium text-[#1F1F1F] transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-80"
    >
      {isLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <GoogleLogo />}
      {isLoading ? "Conectando…" : "Continuar con Google"}
    </button>
  );
}
