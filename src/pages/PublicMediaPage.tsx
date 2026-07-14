import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Flex, Heading, Text } from "@wlcr/base-ic";
import { LogoMark } from "../components/Logo";
import { CoverGallery, type CoverInfo } from "../components/CoverGallery";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StarRating } from "../components/StarRating";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { Credit, MediaType } from "../lib/types";

interface PublicMedia {
  id: string;
  type: MediaType;
  title: string;
  coverImageUrl: string | null;
  covers: CoverInfo[];
  synopsis: string | null;
  releaseDate: string | null;
  credits: Credit[];
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
  const [media, setMedia] = useState<PublicMedia | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

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
          <Button size="2" variant="soft" onClick={() => navigate("/auth/sign-in")}>
            Sign in
          </Button>
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
              {media.synopsis && <Text>{media.synopsis}</Text>}
              <Flex>
                <Button size="3" onClick={() => navigate("/auth/sign-in")}>
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
