import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { createJobOpening } from "../handlers/createJobOpening";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    jobOpening: { create: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockCreate = (prisma as any).jobOpening.create as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const validRequest = {
  jobTitle: "Senior Engineer",
  applicationDeadline: "2024-06-30",
};

describe("createJobOpening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when jobTitle is missing", async () => {
    const cb = makeCallback();
    await createJobOpening(makeCall({ applicationDeadline: "2024-06-30" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_TITLE_DEADLINE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when applicationDeadline is missing", async () => {
    const cb = makeCallback();
    await createJobOpening(makeCall({ jobTitle: "Engineer" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_TITLE_DEADLINE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("creates job opening with correct data on happy path", async () => {
    const created = {
      id: "job-1",
      jobTitle: "Senior Engineer",
      numberOfVacancies: 2,
      jobPostingDate: new Date("2024-03-01"),
      applicationDeadline: new Date("2024-06-30"),
      jobDescription: "Build great things",
      requiredSkills: "TypeScript, Node.js",
      experience: 3,
      budget: ["80000", "100000"],
      department: "",
      hiringManager: "manager1",
      candidatesHired: 0,
      status: "Open",
      createdBy: "admin",
      createdOn: new Date("2024-03-01"),
    };
    mockCreate.mockResolvedValue(created);

    const cb = makeCallback();
    await createJobOpening(
      makeCall({
        ...validRequest,
        jobDescription: "Build great things",
        requiredSkills: "TypeScript, Node.js",
        experience: "3",
        hiringManager: "manager1",
        budget: ["80000", "100000"],
        numberOfVacancies: "2",
        createdBy: "admin",
      }),
      cb,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobTitle: "Senior Engineer",
          experience: 3,
          numberOfVacancies: 2,
          applicationDeadline: expect.any(Date),
          status: "Open",
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_OPENING_CREATED,
      status: status.OK,
      data: expect.objectContaining({
        id: "job-1",
        jobTitle: "Senior Engineer",
      }),
    });
  });

  it("defaults status to 'Open' when jobStatus not provided", async () => {
    const created = {
      id: "job-1",
      jobTitle: "Engineer",
      numberOfVacancies: null,
      jobPostingDate: null,
      applicationDeadline: new Date(),
      jobDescription: "",
      requiredSkills: "",
      experience: 0,
      budget: [],
      department: "",
      hiringManager: "",
      candidatesHired: 0,
      status: "Open",
      createdBy: "",
      createdOn: null,
    };
    mockCreate.mockResolvedValue(created);

    await createJobOpening(makeCall(validRequest), makeCallback());

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Open" }),
      }),
    );
  });

  it("uses provided jobStatus when given", async () => {
    mockCreate.mockResolvedValue({
      id: "job-1",
      jobTitle: "Engineer",
      numberOfVacancies: null,
      jobPostingDate: null,
      applicationDeadline: new Date(),
      jobDescription: "",
      requiredSkills: "",
      experience: 0,
      budget: [],
      department: "",
      hiringManager: "",
      candidatesHired: 0,
      status: "Draft",
      createdBy: "",
      createdOn: null,
    });

    await createJobOpening(
      makeCall({ ...validRequest, jobStatus: "Draft" }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Draft" }),
      }),
    );
  });

  it("defaults numberOfVacancies to null when not provided", async () => {
    mockCreate.mockResolvedValue({
      id: "job-1",
      jobTitle: "Engineer",
      numberOfVacancies: null,
      jobPostingDate: null,
      applicationDeadline: new Date(),
      jobDescription: "",
      requiredSkills: "",
      experience: 0,
      budget: [],
      department: "",
      hiringManager: "",
      candidatesHired: 0,
      status: "Open",
      createdBy: "",
      createdOn: null,
    });

    await createJobOpening(makeCall(validRequest), makeCallback());

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.data.numberOfVacancies).toBeNull();
  });

  it("invalidates job openings cache after creation", async () => {
    mockCreate.mockResolvedValue({
      id: "job-1",
      jobTitle: "Engineer",
      numberOfVacancies: null,
      jobPostingDate: null,
      applicationDeadline: new Date(),
      jobDescription: "",
      requiredSkills: "",
      experience: 0,
      budget: [],
      department: "",
      hiringManager: "",
      candidatesHired: 0,
      status: "Open",
      createdBy: "",
      createdOn: null,
    });

    await createJobOpening(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("jobOpenings:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await createJobOpening(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
