import { useParams } from "react-router-dom";
import { AccountView } from "@neondatabase/auth/react";

/**
 * Neon Auth account management (profile, security, …). This is where the
 * UserButton dropdown's "Settings" link points (/account/:pathname).
 */
export function AccountPage() {
  const { pathname } = useParams<{ pathname: string }>();
  // `.neon-scope` pins the Neon UI palette to dark values (see styles.css) so
  // the in-page sidebar nav has correct contrast.
  return (
    <div className="neon-scope">
      <AccountView pathname={pathname} />
    </div>
  );
}
