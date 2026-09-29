import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { User } from "@/modules/auth/auth.types";

/** The account "Continuar con Google" signs into (simulated OAuth). */
export const MOCK_GOOGLE_USER: User = { name: "Ana Pérez", email: "ana.perez@gmail.com", provider: "google" };

interface AuthState {
  user: User | null;
  login: (email: string) => User;
  register: (name: string, email: string) => User;
  loginWithGoogle: () => User;
  logout: () => void;
}

/** "ana.perez@mail.com" → "Ana Perez": a display name for email logins. */
export function nameFromEmail(email: string): string {
  return email
    .trim()
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Simulated session: any valid credentials sign in. Saved in localStorage. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      const signIn = (user: User) => {
        set({ user });
        return user;
      };
      return {
        user: null,
        login: (email) => signIn({ name: nameFromEmail(email), email: email.trim(), provider: "email" }),
        register: (name, email) => signIn({ name: name.trim(), email: email.trim(), provider: "email" }),
        loginWithGoogle: () => signIn(MOCK_GOOGLE_USER),
        logout: () => set({ user: null }),
      };
    },
    {
      name: "ticketera-auth",
      storage: createJSONStorage(() => localStorage),
      // Loaded after mount (see usePersistHydration) to match the server render.
      skipHydration: true,
      partialize: ({ user }) => ({ user }),
    },
  ),
);
