export type AuthProvider = "email" | "google";

export interface User {
  name: string;
  email: string;
  provider: AuthProvider;
}
