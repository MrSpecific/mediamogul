import { useMemo, useState } from "react";
import { Avatar, Flex, Input, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { getInitials } from "../lib/initials";
import type { UserSummary } from "../lib/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fired when a suggestion is chosen — gets the bare username (no leading @). */
  onPick?: (username: string) => void;
  placeholder?: string;
}

/**
 * A username input that surfaces the people you follow as combobox suggestions
 * as you type (or type "@"), while still accepting any hand-typed username —
 * you can invite someone you don't follow. Controlled via value/onChange.
 *
 * Reusable anywhere a username is entered (collaborator invites, follows, etc.).
 */
export function UsernameCombobox({
  value,
  onChange,
  onPick,
  placeholder = "@username",
}: Props) {
  const { data: follows } = useApiData<UserSummary[]>("/me/following");
  const [focused, setFocused] = useState(false);
  // -1 = nothing highlighted, so Enter submits the typed text rather than
  // forcing a suggestion (that's what lets you invite a non-followed user).
  const [active, setActive] = useState(-1);

  const query = value.trim().replace(/^@/, "").toLowerCase();
  const matches = useMemo(() => {
    const all = follows ?? [];
    const filtered = query
      ? all.filter(
          (u) =>
            u.username.toLowerCase().includes(query) ||
            (u.displayName ?? "").toLowerCase().includes(query),
        )
      : all;
    return filtered.slice(0, 6);
  }, [follows, query]);

  const showList = focused && matches.length > 0;

  const pick = (u: UserSummary) => {
    onChange(`@${u.username}`);
    onPick?.(u.username);
    setFocused(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Only intercept when the user has navigated onto a suggestion; otherwise
      // let the surrounding form submit the typed username.
      if (active >= 0 && matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
      setActive(-1);
    }
  };

  return (
    <div className="username-combobox">
      <Input
        wrapperClassName="grow"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.currentTarget.value);
          setActive(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="username-combobox-list" role="listbox">
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className="username-combobox-item"
              data-active={i === active || undefined}
              // Keep input focus so the click registers before blur closes the list.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(u)}
            >
              <Avatar
                size="1"
                src={u.avatarUrl ?? undefined}
                fallback={getInitials(u.displayName ?? u.username)}
              />
              <Flex direction="column" align="start" className="shrink">
                <Text size="2" weight="medium" truncate>
                  {u.displayName ?? u.username}
                </Text>
                <Text size="1" color="gray">
                  @{u.username}
                </Text>
              </Flex>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
