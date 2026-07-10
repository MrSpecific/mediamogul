import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth/react";
import { Button, Container, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import type { Profile } from "../lib/types";

export function AppLayout() {
  const navigate = useNavigate();
  const { data: me } = useApiData<Profile>("/me");
  return (
    <div className="layout">
      <header className="topbar">
        <Flex
          className="topbar-inner"
          align="center"
          justify="space-between"
          gap="4"
        >
          <Link to="/" className="brand">
            mediamogul
          </Link>
          <SignedIn>
            <Flex as="nav" align="center" gap="4">
              <NavLink to="/catalog">Catalog</NavLink>
              <NavLink to="/lists">Lists</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              {me?.isAdmin && <NavLink to="/admin/genres">Admin</NavLink>}
              <span className="user-full">
                <UserButton size="sm" />
              </span>
              <span className="user-compact">
                <UserButton size="icon" />
              </span>
            </Flex>
          </SignedIn>
          <SignedOut>
            <Button size="2" onClick={() => navigate("/auth/sign-in")}>
              Sign in
            </Button>
          </SignedOut>
        </Flex>
      </header>

      <main className="content">
        <SignedIn>
          <Outlet />
        </SignedIn>
        <SignedOut>
          <Container>
            <Flex direction="column" gap="4" align="center" className="hero">
              <Heading size="8" align="center">
                Track everything you watch, read, and listen to.
              </Heading>
              <Text size="4" color="gray" align="center">
                Movies, TV, books, and magazines — one shared catalog, with your
                history, ratings, reviews, and lists.
              </Text>
              <Button size="3" onClick={() => navigate("/auth/sign-in")}>
                Get started
              </Button>
            </Flex>
          </Container>
        </SignedOut>
      </main>
    </div>
  );
}
