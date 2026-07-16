import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { Check, X } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { timeAgo } from "../lib/time";
import type { AppNotification } from "../lib/types";

export function NotificationsPage() {
  const { data, reload } = useApiData<AppNotification[]>("/notifications");
  // Per-notification response so an invite's buttons resolve once actioned.
  const [responded, setResponded] = useState<Record<string, string>>({});
  const markedRead = useRef(false);

  // Mark everything read once, on first load, so the nav bell clears.
  useEffect(() => {
    if (data && !markedRead.current && data.some((n) => !n.readAt)) {
      markedRead.current = true;
      void apiSend("POST", "/notifications/read-all");
    }
  }, [data]);

  const respond = async (
    notifId: string,
    listId: string,
    accept: boolean,
  ) => {
    await apiSend("POST", `/lists/${listId}/collaboration/respond`, { accept });
    setResponded((s) => ({ ...s, [notifId]: accept ? "accepted" : "declined" }));
    reload();
  };

  return (
    <Flex direction="column" gap="4">
      <Heading size="7">Notifications</Heading>
      {data && data.length === 0 && (
        <Text color="gray">You're all caught up.</Text>
      )}
      {data?.map((n) => (
        <Card key={n.id} size="2">
          <Flex direction="column" gap="2">
            <Flex justify="space-between" align="center" gap="3" wrap="wrap">
              <Text size="2">{n.message}</Text>
              <Text size="1" color="gray">
                {timeAgo(n.createdAt)}
              </Text>
            </Flex>
            {n.type === "CONTENT_SUBMISSION" && (
              <Flex gap="2" align="center" wrap="wrap">
                <Link to="/admin/submissions" className="media-card-link">
                  <Button size="1" variant="soft">
                    Review submissions
                  </Button>
                </Link>
              </Flex>
            )}
            {n.type === "LIST_INVITE" && n.listId && (
              <Flex gap="2" align="center" wrap="wrap">
                {responded[n.id] ? (
                  <Text size="1" color="gray">
                    {responded[n.id] === "accepted"
                      ? "You joined this list."
                      : "Invitation declined."}
                  </Text>
                ) : (
                  <>
                    <Button
                      size="1"
                      onClick={() => void respond(n.id, n.listId!, true)}
                    >
                      <Check size={14} aria-hidden /> Accept
                    </Button>
                    <Button
                      size="1"
                      variant="soft"
                      color="gray"
                      onClick={() => void respond(n.id, n.listId!, false)}
                    >
                      <X size={14} aria-hidden /> Decline
                    </Button>
                  </>
                )}
                <Link to={`/lists/${n.listId}`} className="media-card-link">
                  <Button size="1" variant="ghost">
                    View list
                  </Button>
                </Link>
              </Flex>
            )}
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
