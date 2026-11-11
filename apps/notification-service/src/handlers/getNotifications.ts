import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, openRawForCurrentDb } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const OBJECT_ID = /^[a-f\d]{24}$/i;

// aggregateRaw returns MongoDB extended JSON.
type RawDate = { $date: string | { $numberLong: string } } | string | null;
interface RawRecipient {
  _id: { $oid: string } | string;
  isCleared?: boolean;
  n?: {
    title?: string | null;
    message?: string | null;
    eventType?: string | null;
    timeStamp?: RawDate;
  } | null;
}

const oidString = (v: RawRecipient["_id"]) =>
  typeof v === "string" ? v : v.$oid;

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
    const recipientWhere: any = { userId };
    if (unreadOnly) recipientWhere.isCleared = false;

    // The page and its notification text come back in one aggregation
    // ($lookup) rather than Prisma's `include`, which costs a second,
    // sequential round trip for the parent notifications. Same filter,
    // order (newest recipient first), skip and limit as before.
    const match: Record<string, any> = { userId: { $oid: userId } };
    if (unreadOnly) match.isCleared = false;
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
                  },
                },
              ],
            },
          },
          { $project: { isCleared: 1, n: { $first: "$n" } } },
        ],
      }) as unknown as Promise<RawRecipient[]>,
      prisma.notificationRecipient.count({ where: recipientWhere }),
      prisma.notificationRecipient.count({
        where: { userId, isCleared: false },
      }),
    ]);

    // Notification text is encrypted; the $lookup returns it sealed.
    await openRawForCurrentDb(
      "Notification",
      rows.map((r) => r.n).filter(Boolean),
    );
    const data = rows.map((r) => ({
      id: oidString(r._id),
      title: r.n?.title || "",
      body: r.n?.message || "",
      type: r.n?.eventType || "",
      isRead: Boolean(r.isCleared),
      createdAt: isoDate(r.n?.timeStamp),
    }));

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
