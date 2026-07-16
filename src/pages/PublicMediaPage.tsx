import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Flex, Heading, Text } from "@wlcr/base-ic";
import { authClient } from "../auth";
import { LogoMark } from "../components/Logo";
import { CoverGallery, type CoverInfo } from "../components/CoverGallery";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { MediaDescriptions } from "../components/MediaDescriptions";
import { WhereToWatch } from "../components/WhereToWatch";
import { StarRating } from "../components/StarRating";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { Credit, MediaType, StreamingAvailability } from "../lib/types";

interface PublicMedia {
  id: string;
  type: MediaType;
  title: string;
  coverImageUrl: string | null;
  covers: CoverInfo[];
  shortDescription: string | null;
  synopsis: string | null;
  wikipediaUrl: string | null;
  releaseDate: string | null;
  credits: Credit[];
  streaming: StreamingAvailability[];
  genres: { id: string; name: string; slug: string }[];
  averageRating: number | null;
  ratingCount: number;
}

function byline(m: PublicMedia): string | undefined {
  const cfg = MEDIA_FIELDS[m.type];
  const role = cfg.primaryCredit;
  if (!role) return undefined;
  const names = m.credits
    .filter((c) => c.role === role)
    .map((c) => c.name)
    .join(", ");
  if (!names) return undefined;
  const prefix = cfg.credits.find((c) => c.role === role)?.byline;
  return prefix ? `${prefix} ${names}` : names;
}

/** Public, shareable media page (no auth). OG tags are injected by the Worker. */
export function PublicMediaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session);
  const [media, setMedia] = useState<PublicMedia | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  // The authenticated detail page for this item. Signed-in visitors go straight
  // there; signed-out visitors sign in first, then get bounced there via the
  // Neon Auth UI's `redirectTo` param. (Falling to the sign-in path while the
  // session is still resolving self-heals: an already-authed user is redirected
  // on by the sign-in view.)
  const detailPath = `/media/${id}`;
  const trackDestination = signedIn
    ? detailPath
    : `/auth/sign-in?redirectTo=${encodeURIComponent(detailPath)}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/media/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((m: PublicMedia) => {
        if (alive) {
          setMedia(m);
          setState("ok");
        }
      })
      .catch(() => alive && setState("notfound"));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="layout">
      <header className="topbar">
        <Flex align="center" justify="space-between" gap="4">
          <Link
            to="/"
            className="brand"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <LogoMark size={24} />
            mediamogul
          </Link>
          {!signedIn && (
            <Button
              size="2"
              variant="soft"
              onClick={() => navigate(trackDestination)}
            >
              Sign in
            </Button>
          )}
        </Flex>
      </header>

      <main className="content">
        {state === "loading" && <Text color="gray">Loading…</Text>}
        {state === "notfound" && (
          <Text color="gray">This media isn't available.</Text>
        )}
        {state === "ok" && media && (
          <Flex gap="5" wrap="wrap">
            <CoverGallery
              type={media.type}
              title={media.title}
              covers={media.covers}
              className="detail-cover"
            />
            <Flex direction="column" gap="3" style={{ flex: 1, minWidth: 260 }}>
              <MediaTypeBadge
                type={media.type}
                size="2"
                style={{ alignSelf: "flex-start" }}
              />
              <Heading size="8">{media.title}</Heading>
              <Flex gap="2" align="center" wrap="wrap">
                {media.releaseDate && (
                  <Text color="gray">
                    {new Date(media.releaseDate).getFullYear()}
                  </Text>
                )}
                {byline(media) && <Text color="gray">· {byline(media)}</Text>}
              </Flex>
              <Flex align="center" gap="3">
                <StarRating value={media.averageRating} />
                <Text color="gray" size="2">
                  {media.averageRating != null
                    ? `${media.averageRating.toFixed(1)} (${media.ratingCount})`
                    : "No ratings yet"}
                </Text>
              </Flex>
              {media.genres.length > 0 && (
                <Flex gap="2" wrap="wrap">
                  {media.genres.map((g) => (
                    <Badge key={g.id} variant="soft" color="gray">
                      {g.name}
                    </Badge>
                  ))}
                </Flex>
              )}
              <WhereToWatch streaming={media.streaming} />

              <MediaDescriptions
                shortDescription={media.shortDescription}
                synopsis={media.synopsis}
              />
              {media.wikipediaUrl && (
                <Flex>
                  <a href={media.wikipediaUrl} target="_blank" rel="noreferrer" className="ext-link">
                    Wikipedia
                  </a>
                </Flex>
              )}
              <Flex>
                <Button size="3" onClick={() => navigate(trackDestination)}>
                  Track this on mediamogul
                </Button>
              </Flex>
            </Flex>
          </Flex>
        )}
      </main>
    </div>
  );
}
