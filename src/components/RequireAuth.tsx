import { Outlet, useNavigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@neondatabase/auth/react";
import { Button, Container, Flex, Heading, Text } from "@wlcr/base-ic";
import { LogoMark } from "./Logo";

/**
 * Route guard for the authenticated app. Renders the child routes when signed
 * in; otherwise shows the marketing hero + sign-in prompt. Public routes (e.g.
 * public profiles) are mounted OUTSIDE this guard so they render either way.
 */
export function RequireAuth() {
  const navigate = useNavigate();
  return (
    <>
      <SignedIn>
        <Outlet />
      </SignedIn>
      <SignedOut>
        <Container>
          <Flex direction="column" gap="4" align="center" className="hero">
            <LogoMark size={56} />
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
    </>
  );
}
