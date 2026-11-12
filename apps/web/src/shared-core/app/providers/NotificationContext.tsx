import { createContext, useContext } from "react";

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  timeStamp?: string;
  type?: string;
  read?: boolean;
  isRead?: boolean;
  eventType?: string;
  targetUser?: string;
  createdAt?: string;
  /** App-relative route this notification opens; absent when it has none. */
  link?: string;
  category?: string;
  /** When it was read (ISO); empty/absent = unread. */
  readAt?: string;
  [key: string]: unknown;
}

export interface NotificationContextValue {
  notifications: NotificationItem[];
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  setNotifications: () => {},
  loading: false,
  setLoading: () => {},
});

export function useNotificationContext() {
  return useContext(NotificationContext);
}
