import type { ComponentType, ReactNode } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import "@neondatabase/auth/ui/css";
import { authClient } from "../auth";

// Adapts react-router's <Link> to the shape the auth UI expects.
const Link: ComponentType<{
  href: string;
  className?: string;
  children?: ReactNode;
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
      navigate={(href: string) => navigate(href)}
      replace={(href: string) => navigate(href, { replace: true })}
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
