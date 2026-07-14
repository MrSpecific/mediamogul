import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text, Textarea } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import { useApiData } from "../lib/hooks";

interface Submission {
  id: string;
  kind: string;
  status: string;
  proposedData: Record<string, unknown> | null;
  message: string | null;
  createdAt: string;
  submitter: { username: string; displayName: string | null };
  targetMediaItem: { id: string; title: string; type: string } | null;
  duplicateMediaItem: { id: string; title: string; type: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  MEDIA_EDIT: "Media edit",
  NEW_MEDIA: "New media",
  DUPLICATE: "Duplicate",
  INCORRECT_INFO: "Incorrect information",
  ABUSE: "Abuse",
  OTHER: "Other",
};

export function AdminSubmissionsPage() {
  const navigate = useNavigate();
  const { data, reload } = useApiData<Submission[]>("/submissions?status=PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (id: string, decision: "APPROVE" | "REJECT") => {
    setBusy(id); setError(null);
    try {
      await apiSend("POST", `/submissions/${id}/review`, {
        decision,
        adminNote: notes[id]?.trim() || undefined,
      });
      reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  return <Flex direction="column" gap="4">
    <Flex justify="space-between" align="center" gap="3" wrap="wrap">
      <Heading size="7">Content submissions</Heading>
      <Button variant="soft" onClick={() => navigate("/admin/genres")}>Manage genres</Button>
    </Flex>
    <Text color="gray">Review suggested edits, new catalog entries, duplicate reports, and other feedback.</Text>
    {error && <Text color="red">{error}</Text>}
    {data?.length === 0 && <Card><Text color="gray">No pending submissions.</Text></Card>}
    {data?.map((item) => <Card key={item.id} size="3">
      <Flex direction="column" gap="3">
        <Flex justify="space-between" gap="2" wrap="wrap">
          <Flex gap="2" align="center" wrap="wrap">
            <Badge color={item.kind === "ABUSE" ? "red" : "gray"}>{KIND_LABELS[item.kind] ?? item.kind}</Badge>
            <Text size="2">from <Link to={`/u/${item.submitter.username}`}>@{item.submitter.username}</Link></Text>
          </Flex>
          <Text size="1" color="gray">{new Date(item.createdAt).toLocaleString()}</Text>
        </Flex>
        {item.targetMediaItem && <Text size="2">Target: <Link to={`/media/${item.targetMediaItem.id}`}>{item.targetMediaItem.title}</Link></Text>}
        {item.duplicateMediaItem && <Text size="2">Possible duplicate: <Link to={`/media/${item.duplicateMediaItem.id}`}>{item.duplicateMediaItem.title}</Link></Text>}
        {item.proposedData && <pre className="submission-json">{JSON.stringify(item.proposedData, null, 2)}</pre>}
        {item.message && <Text className="media-description-content">{item.message}</Text>}
        <Textarea rows={2} placeholder="Optional note for the audit trail" value={notes[item.id] ?? ""}
          onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.currentTarget.value }))} />
        <Flex justify="end" gap="2">
          <Button variant="soft" color="red" loading={busy === item.id} onClick={() => void review(item.id, "REJECT")}>Reject</Button>
          <Button color="green" loading={busy === item.id} onClick={() => void review(item.id, "APPROVE")}>Approve</Button>
        </Flex>
      </Flex>
    </Card>)}
  </Flex>;
}
