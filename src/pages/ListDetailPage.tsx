import { useParams } from "react-router-dom";
import { Badge, Button, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { MediaCard } from "../components/MediaCard";
import { mediaTypeLabel, type ListDetail } from "../lib/types";

export function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApiData<ListDetail>(id ? `/lists/${id}` : null);

  if (!data) return <Text color="gray">Loading…</Text>;

  const toggleSave = async () => {
    await apiSend(data.isSaved ? "DELETE" : "PUT", `/lists/${id}/save`);
    reload();
  };
  const remove = async (itemId: string) => {
    await apiSend("DELETE", `/lists/${id}/items/${itemId}`);
    reload();
  };

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex direction="column" gap="2">
          <Heading size="7">{data.title}</Heading>
          {data.description && <Text color="gray">{data.description}</Text>}
          <Flex gap="2" wrap="wrap">
            <Badge variant="soft">{data.visibility.toLowerCase()}</Badge>
            {data.allowedTypes.length ? (
              data.allowedTypes.map((t) => (
                <Badge key={t} variant="outline">
                  {mediaTypeLabel(t)}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">Any type</Badge>
            )}
          </Flex>
        </Flex>
        {!data.isOwner && (
          <Button
            variant={data.isSaved ? "soft" : "solid"}
            onClick={() => void toggleSave()}
          >
            {data.isSaved ? "Saved" : "Save"}
          </Button>
        )}
      </Flex>

      {data.items.length === 0 && (
        <Text color="gray">Empty list — add items from any media page.</Text>
      )}
      <div className="media-grid">
        {data.items.map((it) => (
          <Flex direction="column" gap="1" key={it.id}>
            <MediaCard item={it.mediaItem} />
            {data.isOwner && (
              <Button
                size="1"
                variant="ghost"
                onClick={() => void remove(it.id)}
              >
                Remove
              </Button>
            )}
          </Flex>
        ))}
      </div>
    </Flex>
  );
}
