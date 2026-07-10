import { useParams } from "react-router-dom";
import { AccountView } from "@neondatabase/auth/react";

/**
 * Neon Auth account management (profile, security, …). This is where the
 * UserButton dropdown's "Settings" link points (/account/:pathname).
 */
export function AccountPage() {
  const { pathname } = useParams<{ pathname: string }>();
  return <AccountView pathname={pathname} />;
}
