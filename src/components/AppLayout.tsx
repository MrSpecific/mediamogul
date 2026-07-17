import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth/react";
import { Button, Flex } from "@wlcr/base-ic";
import {
  BarChart3,
  CreditCard,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  User as UserIcon,
  Users,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";
import { InstallButton } from "./InstallButton";
import { useApiData } from "../lib/hooks";
import type { Profile } from "../lib/types";

// Extra items appended to the UserButton dropdown (router-aware links).
const BASE_MENU_LINKS = [
  {
    href: "/settings/profile",
    label: "Profile & account",
    icon: <UserIcon size={16} aria-hidden />,
    signedIn: true,
  },
  {
    href: "/stats",
    label: "Stats",
    icon: <BarChart3 size={16} aria-hidden />,
    signedIn: true,
  },
  {
    href: "/settings",
    label: "Plans & billing",
    icon: <CreditCard size={16} aria-hidden />,
    signedIn: true,
  },
];

const ADMIN_MENU_LINKS = [
  {
    href: "/admin/submissions",
    label: "Admin",
    icon: <Shield size={16} aria-hidden />,
    signedIn: true,
  },
  {
    href: "/admin/users",
    label: "Manage users",
    icon: <Users size={16} aria-hidden />,
    signedIn: true,
  },
  {
    href: "/admin/content-ratings",
    label: "Content ratings",
    icon: <ShieldAlert size={16} aria-hidden />,
    signedIn: true,
  },
  {
    href: "/admin/control",
    label: "Control Center",
    icon: <SlidersHorizontal size={16} aria-hidden />,
    signedIn: true,
  },
];

export function AppLayout() {
  const navigate = useNavigate();
  const { data: me } = useApiData<Profile>("/me");
  const menuLinks = me?.isAdmin
    ? [...BASE_MENU_LINKS, ...ADMIN_MENU_LINKS]
    : BASE_MENU_LINKS;
  return (
    <div className="layout">
      <header className="topbar">
        <Flex
          className="topbar-inner"
          align="center"
          justify="space-between"
          gap="4"
        >
          <Link
            to="/"
            className="brand"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <LogoMark size={24} />
            mediamogul
          </Link>
          <SignedIn>
            <Flex as="nav" align="center" gap="4">
              <NavLink to="/catalog">Catalog</NavLink>
              {/* <NavLink to="/following">Following</NavLink> */}
              <NavLink to="/lists">Lists</NavLink>
              <InstallButton />
              <NotificationsBell />
              <span className="user-full">
                <UserButton size="sm" additionalLinks={menuLinks} />
              </span>
              <span className="user-compact">
                <UserButton size="icon" additionalLinks={menuLinks} />
              </span>
            </Flex>
          </SignedIn>
          <SignedOut>
            <Flex align="center" gap="3">
              <InstallButton />
              <Button size="2" onClick={() => navigate("/auth/sign-in")}>
                Sign in
              </Button>
            </Flex>
          </SignedOut>
        </Flex>
      </header>

      <main className="content">
        {/* Public routes (e.g. public profiles) render for everyone; the
            authenticated app is gated by <RequireAuth> in the route tree. */}
        <Outlet />
      </main>
    </div>
  );
}
