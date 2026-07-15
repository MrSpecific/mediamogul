import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@neondatabase/auth/react";
import { PublicHome } from "./PublicHome";

const ONBOARDED_KEY = "mediamogul:onboarded";

/** One-time nudge to the plan picker after sign-up. Uses a local flag so it
 *  only fires once per browser; the /welcome page marks it seen. */
function OnboardingRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(ONBOARDED_KEY) === "true";
    } catch {
      seen = true; // storage blocked → don't nag
    }
    if (!seen && pathname !== "/welcome") {
      navigate("/welcome", { replace: true });
    }
  }, [navigate, pathname]);
  return null;
}

/**
 * Route guard for the authenticated app. Renders the child routes when signed
 * in; otherwise shows the marketing homepage. Public routes (e.g. public
 * profiles) are mounted OUTSIDE this guard so they render either way.
 */
export function RequireAuth() {
  return (
    <>
      <SignedIn>
        <OnboardingRedirect />
        <Outlet />
      </SignedIn>
      <SignedOut>
        <PublicHome />
      </SignedOut>
    </>
  );
}
