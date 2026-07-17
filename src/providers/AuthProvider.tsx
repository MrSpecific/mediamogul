import type { ComponentType, ReactNode } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import "@neondatabase/auth/ui/css";
import { authClient, clearAuthTokenCache } from "../auth";

// Adapts react-router's <Link> to the shape the auth UI expects.
const Link: ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
}> = ({ href, className, children }) => (
  <RouterLink to={href} className={className}>
    {children}
  </RouterLink>
);

/**
 * Wires Neon Auth's prebuilt UI (AuthView, UserButton, SignedIn/SignedOut) to
 * react-router so its links and redirects use client-side navigation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      // Use the library's callback view for OAuth instead of returning straight
      // to the signed-out homepage. It consumes Neon's session verifier and
      // refetches the session before navigating to the app — especially
      // important when iOS hands control back to an installed PWA.
      baseURL={window.location.origin}
      persistClient
      redirectTo="/"
      onSessionChange={clearAuthTokenCache}
      navigate={(href: string) => navigate(href)}
      replace={(href: string) => navigate(href, { replace: true })}
      Link={Link}
      // Renders the "Continue with Google" button on the sign-in/up views.
      // The Google client id/secret + redirect URL are configured server-side
      // in the Neon Console (Auth → Providers → Google), not here.
      social={{ providers: ["google"] }}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
