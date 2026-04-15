import { prisma } from "@hrms/db";
import {
  getRoles,
  createRole,
  deleteRole,
  updateRolePermissions,
  getRolePermissions,
  getRoleAndPermissions,
  saveUserPermissions,
  getUserPermissions,
  updateSuperuser,
  deleteUserRole,
  getTeams,
  createTeam,
  deleteTeam,
  addTeamMembers,
  deleteUserFromTeam,
} from "../handlers/permissions";

jest.mock("@hrms/db", () => ({
  prisma: {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    team: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockApiResponse = apiResponse as jest.Mock;
const mockRoleFindMany = (prisma as any).role.findMany as jest.Mock;
const mockRoleFindFirst = (prisma as any).role.findFirst as jest.Mock;
const mockRoleFindUnique = (prisma as any).role.findUnique as jest.Mock;
const mockRoleCreate = (prisma as any).role.create as jest.Mock;
const mockRoleUpdate = (prisma as any).role.update as jest.Mock;
const mockRoleDelete = (prisma as any).role.delete as jest.Mock;
const mockUserCount = (prisma as any).user.count as jest.Mock;
const mockUserFindFirst = (prisma as any).user.findFirst as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;
const mockTeamFindMany = (prisma as any).team.findMany as jest.Mock;
const mockTeamFindFirst = (prisma as any).team.findFirst as jest.Mock;
const mockTeamFindUnique = (prisma as any).team.findUnique as jest.Mock;
const mockTeamCreate = (prisma as any).team.create as jest.Mock;
const mockTeamUpdate = (prisma as any).team.update as jest.Mock;
const mockTeamDelete = (prisma as any).team.delete as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("permissionsHandlers", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getRoles", () => {
    it("returns list of roles", async () => {
      mockRoleFindMany.mockResolvedValue([
        { id: "r-1", name: "HR", permissions: [], assignedTo: [] },
      ]);
      const res = makeRes();
      await getRoles(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns empty array on error", async () => {
      mockRoleFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getRoles(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        { data: [] },
      );
    });
  });

  describe("getRoleAndPermissions", () => {
    it("returns roles mapped to _id, name, and permissions", async () => {
      mockRoleFindMany.mockResolvedValue([
        { id: "r-1", name: "HR", permissions: ["view_employees"] },
      ]);
      const res = makeRes();
      await getRoleAndPermissions(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ _id: "r-1", name: "HR" }),
          ]),
        }),
      );
    });

    it("returns empty array on DB error", async () => {
      mockRoleFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getRoleAndPermissions(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        { data: [] },
      );
    });
  });

  describe("getUserPermissions", () => {
    it("returns permissions and role for existing user", async () => {
      mockUserFindFirst.mockResolvedValue({
        permissions: ["view_employees"],
        role: ["HR"],
      });
      const res = makeRes();
      await getUserPermissions(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: { permissions: ["view_employees"], role: ["HR"] },
        }),
      );
    });

    it("returns empty arrays when user not found", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await getUserPermissions(
        makeReq({ params: { username: "unknown" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: { permissions: [], role: [] },
        }),
      );
    });

    it("returns empty arrays on DB error", async () => {
      mockUserFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getUserPermissions(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: { permissions: [], role: [] } }),
      );
    });
  });

  describe("createRole", () => {
    it("returns BAD_REQUEST when name is missing", async () => {
      const res = makeRes();
      await createRole(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when role already exists", async () => {
      mockRoleFindFirst.mockResolvedValue({ id: "r-1", name: "HR" });
      const res = makeRes();
      await createRole(makeReq({ body: { name: "HR" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("creates role when name is unique", async () => {
      mockRoleFindFirst.mockResolvedValue(null);
      mockRoleCreate.mockResolvedValue({ id: "r-2", name: "Manager" });
      const res = makeRes();
      await createRole(makeReq({ body: { name: "Manager" } }), res);
      expect(mockRoleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Manager" }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockRoleFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await createRole(makeReq({ body: { name: "Manager" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("deleteRole", () => {
    it("returns NOT_FOUND when role does not exist", async () => {
      mockRoleFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteRole(makeReq({ params: { _id: "r-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when role has assigned users", async () => {
      mockRoleFindUnique.mockResolvedValue({
        id: "r-1",
        name: "HR",
        permissions: [],
      });
      mockUserCount.mockResolvedValue(3);
      const res = makeRes();
      await deleteRole(makeReq({ params: { _id: "r-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("deletes role with no assigned users", async () => {
      mockRoleFindUnique.mockResolvedValue({ id: "r-1", name: "HR" });
      mockUserCount.mockResolvedValue(0);
      mockRoleDelete.mockResolvedValue({});
      const res = makeRes();
      await deleteRole(makeReq({ params: { _id: "r-1" } }), res);
      expect(mockRoleDelete).toHaveBeenCalledWith({ where: { id: "r-1" } });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockRoleFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await deleteRole(makeReq({ params: { _id: "r-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("updateRolePermissions", () => {
    it("returns NOT_FOUND when role does not exist", async () => {
      mockRoleFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await updateRolePermissions(
        makeReq({ params: { _id: "r-99" }, body: {} }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates permissions for existing role", async () => {
      mockRoleFindUnique.mockResolvedValue({ id: "r-1", name: "HR" });
      mockRoleUpdate.mockResolvedValue({});
      const res = makeRes();
      await updateRolePermissions(
        makeReq({
          params: { _id: "r-1" },
          body: { permissions: ["view_employees"] },
        }),
        res,
      );
      expect(mockRoleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { permissions: ["view_employees"] } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockRoleFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await updateRolePermissions(
        makeReq({ params: { _id: "r-1" }, body: {} }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getRolePermissions", () => {
    it("returns NOT_FOUND when role does not exist", async () => {
      mockRoleFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await getRolePermissions(makeReq({ params: { _id: "r-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns role permissions", async () => {
      mockRoleFindUnique.mockResolvedValue({
        id: "r-1",
        name: "HR",
        permissions: ["view_employees"],
      });
      const res = makeRes();
      await getRolePermissions(makeReq({ params: { _id: "r-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockRoleFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getRolePermissions(makeReq({ params: { _id: "r-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("saveUserPermissions", () => {
    it("returns NOT_FOUND when user does not exist", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await saveUserPermissions(
        makeReq({ body: { selectedUser: "john", permissions: [] } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates user permissions and role", async () => {
      const user = {
        id: "u1",
        username: "john",
        role: [],
        permissions: [],
        first_name: "John",
        last_name: "Doe",
        employee_photo: null,
      };
      mockUserFindFirst.mockResolvedValue(user);
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await saveUserPermissions(
        makeReq({
          body: {
            selectedUser: "john",
            permissions: ["view_employees"],
            selectedRole: null,
          },
        }),
        res,
      );
      expect(mockUserUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("assigns role to user and adds to role's assignedTo list", async () => {
      const user = {
        id: "u1",
        username: "john",
        role: [],
        permissions: [],
        first_name: "John",
        last_name: "Doe",
        employee_photo: "photo.jpg",
      };
      const roleDoc = {
        id: "r-1",
        name: "HR",
        assignedTo: [],
        permissions: ["view_employees"],
      };
      mockUserFindFirst.mockResolvedValue(user);
      mockUserUpdate.mockResolvedValue({});
      mockRoleFindFirst.mockResolvedValue(roleDoc);
      mockRoleUpdate.mockResolvedValue({});

      const res = makeRes();
      await saveUserPermissions(
        makeReq({
          body: {
            selectedUser: "john",
            permissions: ["view_employees"],
            selectedRole: "HR",
          },
        }),
        res,
      );

      expect(mockRoleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r-1" },
          data: expect.objectContaining({
            assignedTo: expect.arrayContaining([
              expect.objectContaining({ username: "john" }),
            ]),
          }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("skips adding to assignedTo when user already assigned to role", async () => {
      const user = {
        id: "u1",
        username: "john",
        role: ["HR"],
        permissions: [],
        first_name: "John",
        last_name: "Doe",
        employee_photo: null,
      };
      const roleDoc = {
        id: "r-1",
        name: "HR",
        assignedTo: [{ username: "john" }],
        permissions: [],
      };
      mockUserFindFirst.mockResolvedValue(user);
      mockUserUpdate.mockResolvedValue({});
      mockRoleFindFirst.mockResolvedValue(roleDoc);

      const res = makeRes();
      await saveUserPermissions(
        makeReq({
          body: {
            selectedUser: "john",
            permissions: [],
            selectedRole: "HR",
          },
        }),
        res,
      );

      // role.update should NOT be called since user is already in assignedTo
      expect(mockRoleUpdate).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await saveUserPermissions(
        makeReq({ body: { selectedUser: "john", permissions: [] } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("updateSuperuser", () => {
    it("returns NOT_FOUND when user not found", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await updateSuperuser(
        makeReq({ params: { username: "john" }, body: { isSuperUser: true } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates superuser status", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "u1" });
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await updateSuperuser(
        makeReq({ params: { username: "john" }, body: { isSuperUser: true } }),
        res,
      );
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isSuperUser: true } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await updateSuperuser(
        makeReq({ params: { username: "john" }, body: { isSuperUser: true } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("deleteUserRole", () => {
    it("returns NOT_FOUND when role not found", async () => {
      (prisma as any).role.findUnique.mockResolvedValue(null);
      (prisma as any).user.findFirst.mockResolvedValue({ id: "u1" });
      const res = makeRes();
      await deleteUserRole(
        makeReq({ body: { username: "john", roleId: "r-99" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when user does not have the role", async () => {
      (prisma as any).role.findUnique.mockResolvedValue({
        id: "r-1",
        name: "HR",
        permissions: [],
        assignedTo: [],
      });
      (prisma as any).user.findFirst.mockResolvedValue({
        id: "u1",
        role: ["Manager"],
        permissions: [],
      });
      const res = makeRes();
      await deleteUserRole(
        makeReq({ body: { username: "john", roleId: "r-1" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("removes role from user and user from role's assignedTo", async () => {
      (prisma as any).role.findUnique.mockResolvedValue({
        id: "r-1",
        name: "HR",
        permissions: ["view_employees"],
        assignedTo: [{ username: "john" }, { username: "alice" }],
      });
      (prisma as any).user.findFirst.mockResolvedValue({
        id: "u1",
        username: "john",
        role: ["HR", "Manager"],
        permissions: ["view_employees", "edit_employees"],
      });
      mockUserUpdate.mockResolvedValue({});
      mockRoleUpdate.mockResolvedValue({});

      const res = makeRes();
      await deleteUserRole(
        makeReq({ body: { username: "john", roleId: "r-1" } }),
        res,
      );

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: ["Manager"] }),
        }),
      );
      expect(mockRoleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedTo: [{ username: "alice" }],
          }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when user not found", async () => {
      (prisma as any).role.findUnique.mockResolvedValue({
        id: "r-1",
        name: "HR",
        permissions: [],
        assignedTo: [],
      });
      (prisma as any).user.findFirst.mockResolvedValue(null);
      const res = makeRes();
      await deleteUserRole(
        makeReq({ body: { username: "unknown", roleId: "r-1" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      (prisma as any).role.findUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await deleteUserRole(
        makeReq({ body: { username: "john", roleId: "r-1" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getTeams", () => {
    it("returns list of teams", async () => {
      mockTeamFindMany.mockResolvedValue([
        { id: "t-1", teamName: "Alpha", teamLeader: "alice", members: [] },
      ]);
      const res = makeRes();
      await getTeams(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns empty array on DB error", async () => {
      mockTeamFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getTeams(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        { data: [] },
      );
    });
  });

  describe("createTeam", () => {
    it("returns BAD_REQUEST when name or leader missing", async () => {
      const res = makeRes();
      await createTeam(makeReq({ body: { teamName: "Alpha" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("creates team when valid", async () => {
      mockTeamFindFirst.mockResolvedValue(null);
      mockTeamCreate.mockResolvedValue({ id: "t-1" });
      const res = makeRes();
      await createTeam(
        makeReq({ body: { teamName: "Alpha", teamLeader: "alice" } }),
        res,
      );
      expect(mockTeamCreate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when team name already exists", async () => {
      mockTeamFindFirst.mockResolvedValue({ id: "t-1", teamName: "Alpha" });
      const res = makeRes();
      await createTeam(
        makeReq({ body: { teamName: "Alpha", teamLeader: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockTeamFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await createTeam(
        makeReq({ body: { teamName: "Alpha", teamLeader: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("deleteTeam", () => {
    it("returns NOT_FOUND when team not found", async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteTeam(makeReq({ params: { _id: "t-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("deletes existing team", async () => {
      mockTeamFindUnique.mockResolvedValue({ id: "t-1", teamName: "Alpha" });
      mockTeamDelete.mockResolvedValue({});
      await deleteTeam(makeReq({ params: { _id: "t-1" } }), makeRes());
      expect(mockTeamDelete).toHaveBeenCalledWith({ where: { id: "t-1" } });
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockTeamFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await deleteTeam(makeReq({ params: { _id: "t-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("addTeamMembers", () => {
    it("returns NOT_FOUND when team not found", async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await addTeamMembers(
        makeReq({ body: { teamId: "t-99", members: ["alice"] } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when user already in team", async () => {
      mockTeamFindUnique.mockResolvedValue({ id: "t-1", members: ["alice"] });
      const res = makeRes();
      await addTeamMembers(
        makeReq({ body: { teamId: "t-1", members: ["alice"] } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("adds new members successfully", async () => {
      mockTeamFindUnique.mockResolvedValue({ id: "t-1", members: [] });
      mockTeamUpdate.mockResolvedValue({});
      const res = makeRes();
      await addTeamMembers(
        makeReq({ body: { teamId: "t-1", members: ["alice"] } }),
        res,
      );
      expect(mockTeamUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockTeamFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await addTeamMembers(
        makeReq({ body: { teamId: "t-1", members: ["alice"] } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("deleteUserFromTeam", () => {
    it("returns NOT_FOUND when team not found", async () => {
      mockTeamFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await deleteUserFromTeam(
        makeReq({ body: { teamId: "t-99", username: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when user not in team", async () => {
      mockTeamFindUnique.mockResolvedValue({ id: "t-1", members: ["bob"] });
      const res = makeRes();
      await deleteUserFromTeam(
        makeReq({ body: { teamId: "t-1", username: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("removes user from team", async () => {
      mockTeamFindUnique.mockResolvedValue({
        id: "t-1",
        members: ["alice", "bob"],
      });
      mockTeamUpdate.mockResolvedValue({});
      const res = makeRes();
      await deleteUserFromTeam(
        makeReq({ body: { teamId: "t-1", username: "alice" } }),
        res,
      );
      expect(mockTeamUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ members: ["bob"] }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockTeamFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await deleteUserFromTeam(
        makeReq({ body: { teamId: "t-1", username: "alice" } }),
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
