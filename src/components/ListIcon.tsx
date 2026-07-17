import { LIST_ICON_BY_HANDLE } from "../lib/list-icons";

/** Render a list's icon by its stored handle. Renders nothing for an
 *  unknown/absent handle (the caller decides on any fallback). */
export function ListIcon({
  handle,
  size = 16,
}: {
  handle: string | null | undefined;
  size?: number;
}) {
  if (!handle) return null;
  const Icon = LIST_ICON_BY_HANDLE[handle];
  if (!Icon) return null;
  return <Icon size={size} aria-hidden />;
}
