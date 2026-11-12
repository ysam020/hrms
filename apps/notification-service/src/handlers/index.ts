import { sendNotification } from "./sendNotification";
import { sendBulkNotification } from "./sendBulkNotification";
import { getNotifications } from "./getNotifications";
import { markAsRead } from "./markAsRead";
import { markAllAsRead } from "./markAllAsRead";
import { deleteNotification } from "./deleteNotification";
import { readNotifications, readAllNotifications } from "./readNotifications";

export const handlers = {
  SendNotification: sendNotification,
  SendBulkNotification: sendBulkNotification,
  GetNotifications: getNotifications,
  MarkAsRead: markAsRead,
  MarkAllAsRead: markAllAsRead,
  DeleteNotification: deleteNotification,
  ReadNotifications: readNotifications,
  ReadAllNotifications: readAllNotifications,
};
