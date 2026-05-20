import { prisma } from "@hrms/db";
import {
  sanitizePart,
  getHolidays,
  addHoliday,
  deleteHoliday,
  getCalendarEvents,
  getBirthdaysAnniversaries,
  getAuditLogs,
  addEvent,
  editCalendarEvent,
  deleteCalendarEvent,
  getPresignedUrl,
} from "../handlers/general";

jest.mock("@hrms/db", () => {
  const _db = {
    holiday: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.mock("../config/s3", () => ({
  s3Client: {},
  S3_BUCKET: "test-bucket",
  s3FileUrl: jest.fn((key: string) => `https://s3.example.com/${key}`),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: jest.fn().mockImplementation((opts: any) => opts),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example.com/key"),
}));

import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const mockApiResponse = apiResponse as jest.Mock;
const mockHolidayFindMany = (prisma as any).holiday.findMany as jest.Mock;
const mockHolidayFindFirst = (prisma as any).holiday.findFirst as jest.Mock;
const mockHolidayUpdate = (prisma as any).holiday.update as jest.Mock;
const mockHolidayCreate = (prisma as any).holiday.create as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockUserFindFirst = (prisma as any).user.findFirst as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;
const mockAuditLogFindMany = (prisma as any).auditLog.findMany as jest.Mock;
const mockGetSignedUrl = getSignedUrl as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("generalHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cacheManager.get as jest.Mock).mockResolvedValue(null);
    (cacheManager.set as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.delete as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
  });

  describe("sanitizePart", () => {
    it("strips path traversal and replaces slashes with underscores", () => {
      expect(sanitizePart("../../etc/passwd")).toBe("__etc_passwd");
    });

    it("replaces forward slashes with underscores", () => {
      expect(sanitizePart("folder/file")).toBe("folder_file");
    });

    it("returns null for empty string", () => {
      expect(sanitizePart("")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(sanitizePart(undefined)).toBeNull();
    });

    it("truncates to 100 characters", () => {
      const result = sanitizePart("a".repeat(200));
      expect(result).toHaveLength(100);
    });

    it("returns null for percent-encoded-only input (all meaningful chars stripped)", () => {
      // %2e = dot, %2f = slash — both stripped, leaving empty string → null
      const result = sanitizePart("%2e%2e%2f");
      expect(result).toBeNull();
    });
  });

  describe("getHolidays", () => {
    it("returns BAD_REQUEST for non-numeric year", async () => {
      const res = makeRes();
      await getHolidays(makeReq({ params: { year: "abc" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns flattened holiday list for valid year", async () => {
      mockHolidayFindMany.mockResolvedValue([
        {
          month: 1,
          holidays: [
            {
              name: "New Year",
              date: "2024-01-01",
              createdBy: "admin",
              createdOn: new Date(),
            },
          ],
        },
      ]);
      const res = makeRes();
      await getHolidays(makeReq({ params: { year: "2024" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ name: "New Year", month: 1 }),
          ]),
        }),
      );
    });

    it("returns empty array when no holidays found", async () => {
      mockHolidayFindMany.mockResolvedValue([]);
      const res = makeRes();
      await getHolidays(makeReq({ params: { year: "2024" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: [] }),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockHolidayFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getHolidays(makeReq({ params: { year: "2024" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("addHoliday", () => {
    it("returns BAD_REQUEST when name or date missing", async () => {
      const res = makeRes();
      await addHoliday(makeReq({ body: { name: "Holiday" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for invalid date format", async () => {
      const res = makeRes();
      await addHoliday(
        makeReq({ body: { name: "Holiday", date: "not-a-date" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when holiday already exists for that date", async () => {
      mockHolidayFindFirst.mockResolvedValue({
        id: "h1",
        year: 2024,
        month: 1,
        holidays: [{ date: "2024-01-01", name: "New Year" }],
      });
      const res = makeRes();
      await addHoliday(
        makeReq({ body: { name: "Another", date: "2024-01-01" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("updates existing month record with new holiday", async () => {
      mockHolidayFindFirst.mockResolvedValue({
        id: "h1",
        year: 2024,
        month: 3,
        holidays: [],
      });
      mockHolidayUpdate.mockResolvedValue({});
      const res = makeRes();
      await addHoliday(
        makeReq({ body: { name: "Holi", date: "2024-03-25" } }),
        res,
      );
      expect(mockHolidayUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("creates new month record when none exists", async () => {
      mockHolidayFindFirst.mockResolvedValue(null);
      mockHolidayCreate.mockResolvedValue({});
      const res = makeRes();
      await addHoliday(
        makeReq({ body: { name: "Independence Day", date: "2024-08-15" } }),
        res,
      );
      expect(mockHolidayCreate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockHolidayFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await addHoliday(
        makeReq({ body: { name: "Holiday", date: "2024-03-15" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("deleteHoliday", () => {
    it("returns BAD_REQUEST when date missing", async () => {
      const res = makeRes();
      await deleteHoliday(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for invalid date format", async () => {
      const res = makeRes();
      await deleteHoliday(makeReq({ body: { date: "invalid-date" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when no holiday record for year/month", async () => {
      mockHolidayFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await deleteHoliday(makeReq({ body: { date: "2024-03-15" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when holiday date not in list", async () => {
      mockHolidayFindFirst.mockResolvedValue({
        id: "h1",
        holidays: [{ date: "2024-03-10", name: "Other" }],
      });
      const res = makeRes();
      await deleteHoliday(makeReq({ body: { date: "2024-03-15" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("removes holiday and updates record", async () => {
      mockHolidayFindFirst.mockResolvedValue({
        id: "h1",
        holidays: [
          { date: "2024-03-15", name: "Holiday" },
          { date: "2024-03-20", name: "Other" },
        ],
      });
      mockHolidayUpdate.mockResolvedValue({});
      const res = makeRes();
      await deleteHoliday(makeReq({ body: { date: "2024-03-15" } }), res);
      const updateArg = mockHolidayUpdate.mock.calls[0][0];
      expect(updateArg.data.holidays).toHaveLength(1);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("getCalendarEvents", () => {
    it("returns NOT_FOUND when user not found", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await getCalendarEvents(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns events sorted by date ascending", async () => {
      mockUserFindUnique.mockResolvedValue({
        events: [
          {
            _id: "e2",
            title: "Later",
            date: "2024-03-20",
            startTime: "10:00",
            endTime: "11:00",
            description: "",
          },
          {
            _id: "e1",
            title: "Earlier",
            date: "2024-03-10",
            startTime: "09:00",
            endTime: "10:00",
            description: "",
          },
        ],
      });
      const res = makeRes();
      await getCalendarEvents(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      const data = call[2].data;
      expect(data[0].title).toBe("Earlier");
      expect(data[1].title).toBe("Later");
    });

    it("returns empty array when user has no events", async () => {
      mockUserFindUnique.mockResolvedValue({ events: [] });
      const res = makeRes();
      await getCalendarEvents(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: [] }),
      );
    });
  });

  describe("getBirthdaysAnniversaries", () => {
    it("returns BAD_REQUEST when month or year missing", async () => {
      const res = makeRes();
      await getBirthdaysAnniversaries(makeReq({ query: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns birthdays and anniversaries for matching month", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          first_name: "Alice",
          last_name: "Doe",
          username: "alice",
          dob: "1995-03-10T00:00:00.000Z",
          joining_date: "2020-03-05T00:00:00.000Z",
          department: "HR",
        },
      ]);
      const res = makeRes();
      await getBirthdaysAnniversaries(
        makeReq({ query: { month: "3", year: "2024" } }),
        res,
      );
      const call = mockApiResponse.mock.calls[0];
      expect(call[1]).toBe(RESPONSE_STATUS.SUCCESS);
      const data = call[2].data;
      expect(data.some((d: any) => d.type === "birthday")).toBe(true);
      expect(data.some((d: any) => d.type === "anniversary")).toBe(true);
    });

    it("does not include anniversary in year when years == 0", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          username: "alice",
          first_name: "Alice",
          last_name: "Doe",
          dob: null,
          joining_date: "2024-03-15T00:00:00.000Z", // same year as query
          department: "HR",
        },
      ]);
      const res = makeRes();
      await getBirthdaysAnniversaries(
        makeReq({ query: { month: "3", year: "2024" } }),
        res,
      );
      const call = mockApiResponse.mock.calls[0];
      const data = call[2].data;
      expect(data.filter((d: any) => d.type === "anniversary")).toHaveLength(0);
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getBirthdaysAnniversaries(
        makeReq({ query: { month: "3", year: "2024" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getAuditLogs", () => {
    it("returns mapped audit logs", async () => {
      mockAuditLogFindMany.mockResolvedValue([
        {
          id: "l1",
          action: "CREATE",
          entityType: "Employee",
          description: "Created",
          timestamp: new Date(),
        },
      ]);
      const res = makeRes();
      await getAuditLogs(makeReq({ query: { days: "7" } }), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[1]).toBe(RESPONSE_STATUS.SUCCESS);
      expect(call[2].data[0]._id).toBe("l1");
      expect(call[2].data[0].action).toBe("CREATE");
    });

    it("filters by userId when userName matches a user", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "u1" });
      mockAuditLogFindMany.mockResolvedValue([]);
      const res = makeRes();
      await getAuditLogs(makeReq({ query: { userName: "alice" } }), res);
      const whereArg = mockAuditLogFindMany.mock.calls[0][0].where;
      expect(whereArg.userId).toBe("u1");
    });

    it("does not filter by userId when userName not found", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      mockAuditLogFindMany.mockResolvedValue([]);
      const res = makeRes();
      await getAuditLogs(makeReq({ query: { userName: "ghost" } }), res);
      const whereArg = mockAuditLogFindMany.mock.calls[0][0].where;
      expect(whereArg.userId).toBeUndefined();
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockAuditLogFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getAuditLogs(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("addEvent", () => {
    it("returns NOT_FOUND when user not found", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await addEvent(
        makeReq({ body: { title: "Meeting", date: "2024-03-15" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("adds event to user events list and returns CREATED", async () => {
      mockUserFindUnique.mockResolvedValue({ events: [] });
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await addEvent(
        makeReq({
          body: {
            title: "Team Standup",
            date: "2024-03-15",
            startTime: "10:00",
            endTime: "10:15",
          },
        }),
        res,
      );
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-1" },
          data: expect.objectContaining({ events: expect.any(Array) }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.CREATED,
        expect.objectContaining({
          data: expect.objectContaining({ title: "Team Standup" }),
        }),
      );
    });
  });

  describe("editCalendarEvent", () => {
    it("returns NOT_FOUND when user not found", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await editCalendarEvent(makeReq({ params: { _id: "e1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when event not in user's events", async () => {
      mockUserFindUnique.mockResolvedValue({
        events: [{ _id: "e99", title: "Other" }],
      });
      const res = makeRes();
      await editCalendarEvent(makeReq({ params: { _id: "e1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates matching event and returns SUCCESS", async () => {
      mockUserFindUnique.mockResolvedValue({
        events: [
          {
            _id: "e1",
            title: "Old Title",
            date: "2024-03-10",
            startTime: "09:00",
            endTime: "10:00",
            description: "",
          },
        ],
      });
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await editCalendarEvent(
        makeReq({ params: { _id: "e1" }, body: { title: "New Title" } }),
        res,
      );
      expect(mockUserUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ title: "New Title" }),
        }),
      );
    });
  });

  describe("deleteCalendarEvent", () => {
    it("returns NOT_FOUND when user not found", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteCalendarEvent(makeReq({ params: { _id: "e1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when event not found", async () => {
      mockUserFindUnique.mockResolvedValue({ events: [] });
      const res = makeRes();
      await deleteCalendarEvent(makeReq({ params: { _id: "e1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("removes event from list and updates user", async () => {
      mockUserFindUnique.mockResolvedValue({
        events: [
          { _id: "e1", title: "Meeting" },
          { _id: "e2", title: "Other" },
        ],
      });
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await deleteCalendarEvent(makeReq({ params: { _id: "e1" } }), res);
      const updateArg = mockUserUpdate.mock.calls[0][0];
      expect(updateArg.data.events).toHaveLength(1);
      expect(updateArg.data.events[0]._id).toBe("e2");
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("getPresignedUrl", () => {
    it("returns BAD_REQUEST when required fields are missing", async () => {
      const res = makeRes();
      await getPresignedUrl(makeReq({ body: { fileName: "file.jpg" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for dangerous file extension", async () => {
      const res = makeRes();
      await getPresignedUrl(
        makeReq({
          body: {
            fileName: "virus.exe",
            fileType: "application/octet-stream",
            folder: "uploads",
            username: "alice",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for disallowed extension", async () => {
      const res = makeRes();
      await getPresignedUrl(
        makeReq({
          body: {
            fileName: "file.xyz",
            fileType: "application/octet-stream",
            folder: "uploads",
            username: "alice",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST for disallowed mime type", async () => {
      const res = makeRes();
      await getPresignedUrl(
        makeReq({
          body: {
            fileName: "file.jpg",
            fileType: "application/octet-stream",
            folder: "uploads",
            username: "alice",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns presigned URL for valid file", async () => {
      const res = makeRes();
      await getPresignedUrl(
        makeReq({
          body: {
            fileName: "photo.jpg",
            fileType: "image/jpeg",
            folder: "employees",
            username: "alice",
            formikField: "employee_photo",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            url: expect.any(String),
            key: expect.any(String),
          }),
        }),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on S3 error", async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error("S3 error"));
      const res = makeRes();
      await getPresignedUrl(
        makeReq({
          body: {
            fileName: "photo.jpg",
            fileType: "image/jpeg",
            folder: "employees",
            username: "alice",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
