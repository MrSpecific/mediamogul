import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Bell } from "lucide-react";
import { useApiData } from "../lib/hooks";

/** Nav bell linking to the notifications page, with an unread-count badge that
 *  refreshes periodically. */
export function NotificationsBell() {
  const { data, reload } = useApiData<{ count: number }>(
    "/notifications/unread-count",
  );

  // Light polling so the badge stays roughly current without a socket.
  useEffect(() => {
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);

  const count = data?.count ?? 0;
  return (
    <NavLink
      to="/notifications"
      className="notif-bell"
      aria-label={
        count ? `Notifications, ${count} unread` : "Notifications"
      }
    >
      <Bell size={20} aria-hidden />
      {count > 0 && (
        <span className="notif-badge">{count > 9 ? "9+" : count}</span>
      )}
    </NavLink>
  );
}
