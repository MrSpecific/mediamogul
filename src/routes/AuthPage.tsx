import { useParams } from "react-router-dom";
import { AuthView } from "@neondatabase/auth/react";

/**
 * Renders Neon Auth's sign-in / sign-up / reset / callback views. The path
 * segment (`/auth/:pathname`) selects which view to show.
 */
export function AuthPage() {
  const { pathname } = useParams<{ pathname: string }>();
  return (
    <main className="auth-page">
      <AuthView pathname={pathname} />
    </main>
  );
}
