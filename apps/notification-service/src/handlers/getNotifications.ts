import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, openRawForCurrentDb } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const OBJECT_ID = /^[a-f\d]{24}$/i;

// aggregateRaw returns MongoDB extended JSON.
type RawDate = { $date: string | { $numberLong: string } } | string | null;
type RawId = { $oid: string } | string;
interface RawRecipient {
  _id: RawId;
  notificationId: RawId;
  readAt?: RawDate;
  n?: {
    title?: string | null;
    message?: string | null;
    eventType?: string | null;
    timeStamp?: RawDate;
    link?: string | null;
    category?: string | null;
    priority?: string | null;
  } | null;
}

const oidString = (v: RawId) => (typeof v === "string" ? v : v.$oid);

// Unread = readAt never set. Rows written before read state existed have no
// readAt field at all; Prisma's `readAt: null` doesn't match a missing field
// on MongoDB, hence both arms.
export const UNREAD = {
  OR: [{ readAt: null }, { readAt: { isSet: false as const } }],
};

function isoDate(v: RawDate | undefined): string {
  if (!v) return "";
  const raw = typeof v === "string" ? v : v.$date;
  const d =
    typeof raw === "string" ? new Date(raw) : new Date(Number(raw.$numberLong));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export const getNotifications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, unreadOnly = false, page = 1, limit = 20 } = call.request;

    if (!userId || !OBJECT_ID.test(String(userId))) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const skip = (page - 1) * limit;
    // A cleared notification is gone from the person's list for good;
    // unreadOnly further narrows to ones not yet read.
    const recipientWhere: any = {
      userId,
      isCleared: false,
      ...(unreadOnly ? UNREAD : {}),
    };

    // The page and its notification text come back in one aggregation
    // ($lookup) rather than Prisma's `include`, which costs a second,
    // sequential round trip for the parent notifications. Newest first.
    // Raw `readAt: null` matches both null and a missing field.
    const match: Record<string, any> = {
      userId: { $oid: userId },
      isCleared: false,
    };
    if (unreadOnly) match.readAt = null;
    const [rows, total, unreadCount] = await Promise.all([
      prisma.notificationRecipient.aggregateRaw({
        pipeline: [
          { $match: match },
          { $sort: { _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "notifications",
              localField: "notificationId",
              foreignField: "_id",
              as: "n",
              pipeline: [
                {
                  $project: {
                    title: 1,
                    message: 1,
                    eventType: 1,
                    timeStamp: 1,
                    link: 1,
                    category: 1,
                    priority: 1,
                  },
                },
              ],
            },
          },
          {
            $project: {
              notificationId: 1,
              readAt: 1,
              n: { $first: "$n" },
            },
          },
        ],
      }) as unknown as Promise<RawRecipient[]>,
      prisma.notificationRecipient.count({ where: recipientWhere }),
      prisma.notificationRecipient.count({
        where: { userId, isCleared: false, ...UNREAD },
      }),
    ]);

    // Notification text is encrypted; the $lookup returns it sealed.
    await openRawForCurrentDb(
      "Notification",
      rows.map((r) => r.n).filter(Boolean),
    );
    // `id` is the NOTIFICATION id — the same id the socket push carries and
    // the one clear/read act on. (It used to be this recipient row's own id,
    // which no clear call could match, so a fetched notification couldn't be
    // cleared.)
    const data = rows.map((r) => {
      const readAt = isoDate(r.readAt);
      return {
        id: oidString(r.notificationId),
        title: r.n?.title || "",
        body: r.n?.message || "",
        type: r.n?.eventType || "",
        isRead: readAt !== "",
        readAt,
        link: r.n?.link || "",
        category: r.n?.category || "",
        priority: r.n?.priority || "",
        createdAt: isoDate(r.n?.timeStamp),
      };
    });

    return callback(null, {
      message: MESSAGES.NOTIFICATIONS_FETCHED,
      status: status.OK,
      data,
      total,
      unreadCount,
    });
  } catch (err) {
    logger.error("GetNotifications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
      unreadCount: 0,
    });
  }
};
