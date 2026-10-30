import { Request, Response } from "express";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { AuthRequest } from "../middleware/authenticate";
import {
  apiResponse,
  RESPONSE_STATUS,
  partitionPermissions,
  isPlatformOnlyPermission,
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
} from "@hrms/common";
import { notify } from "@hrms/notifications";
import { handleError } from "../utils/handleError";
import { isPlatformTenant } from "../config/platform";

/**
 * Platform-only permissions (e.g. PraestoSupport:*) as seen from this
 * request's tenant: anywhere but Praesto's own organisation they don't
 * exist, so they're reported exactly like an unknown permission.
 */
function platformOnlyRejected(req: Request, permissions: string[]): string[] {
  if (isPlatformTenant((req as AuthRequest).user?.tenantId)) return [];
  return permissions.filter(isPlatformOnlyPermission);
}

export async function getRoles(_req: Request, res: Response) {
  try {
    const roles = await prisma.role.findMany();
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: roles.map((r: any) => ({
        _id: r.id,
        name: r.name || "",
        permissions: r.permissions,
        assignedTo: r.assignedTo,
      })),
    });
  } catch (error: unknown) {
    logger.error("get-roles error:", { error });
    return handleError(res, error);
  }
}

export async function createRole(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { name } = req.body;
    if (!name)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Role name is required",
      });
    const existing = await prisma.role.findFirst({ where: { name } });
    if (existing)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Role with this name already exists",
      });
    const role = await prisma.role.create({
      data: {
        tenantId: user!.tenantId!,
        name,
        permissions: [],
        assignedTo: [],
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Role created successfully",
      data: { roleId: role.id },
    });
  } catch (error: unknown) {
    logger.error("create-role error:", { error });
    return handleError(res, error);
  }
}

export async function deleteRole(req: Request, res: Response) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!role)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Role not found",
      });
    const usersWithRole = await prisma.user.count({
      where: { role: { has: role.name! } },
    });
    if (usersWithRole > 0)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot delete role that has assigned users",
      });
    await prisma.role.delete({ where: { id: String(req.params._id) } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Role deleted successfully",
    });
  } catch (error: unknown) {
    logger.error("delete-role error:", { error });
    return handleError(res, error);
  }
}

export async function updateRolePermissions(req: Request, res: Response) {
  try {
    const { permissions } = req.body;
    const role = await prisma.role.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!role)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Role not found",
      });

    const { valid, invalid } = partitionPermissions(permissions ?? []);
    const rejected = [...invalid, ...platformOnlyRejected(req, valid)];
    if (rejected.length > 0)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Unknown permission(s): ${rejected.join(", ")}`,
      });

    await prisma.role.update({
      where: { id: String(req.params._id) },
      data: { permissions: valid },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Role permissions updated successfully",
    });
  } catch (error: unknown) {
    logger.error("update-role-permissions error:", { error });
    return handleError(res, error);
  }
}

export async function getRolePermissions(req: Request, res: Response) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!role)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Role not found",
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        _id: role.id,
        name: role.name || "",
        permissions: role.permissions,
      },
    });
  } catch (error: unknown) {
    logger.error("get-role-permissions error:", { error });
    return handleError(res, error);
  }
}

export async function getRoleAndPermissions(_req: Request, res: Response) {
  try {
    const roles = await prisma.role.findMany();
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: roles.map((r: any) => ({
        _id: r.id,
        name: r.name || "",
        permissions: r.permissions,
      })),
    });
  } catch (error: unknown) {
    logger.error("get-role-and-permissions error:", { error });
    return handleError(res, error);
  }
}

export async function saveUserPermissions(req: Request, res: Response) {
  try {
    const { selectedUser, permissions, selectedRole } = req.body;
    const user = await prisma.user.findFirst({
      where: { username: selectedUser },
    });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const { valid: validPermissions, invalid: invalidPermissions } =
      partitionPermissions(permissions ?? []);
    const rejected = [
      ...invalidPermissions,
      ...platformOnlyRejected(req, validPermissions),
    ];
    if (rejected.length > 0)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Unknown permission(s): ${rejected.join(", ")}`,
      });

    const newRoleName: string | null = selectedRole
      ? typeof selectedRole === "string"
        ? selectedRole
        : selectedRole?.name || null
      : null;

    const updatedRole = Array.isArray(user.role) ? [...user.role] : [];
    if (newRoleName && !updatedRole.includes(newRoleName)) {
      updatedRole.push(newRoleName);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { permissions: validPermissions, role: updatedRole },
    });

    if (newRoleName) {
      const roleDoc = await prisma.role.findFirst({
        where: { name: newRoleName },
      });
      if (roleDoc) {
        const assignedTo = Array.isArray(roleDoc.assignedTo)
          ? (roleDoc.assignedTo as any[])
          : [];
        const alreadyAssigned = assignedTo.some(
          (a: any) => a.username === selectedUser,
        );
        if (!alreadyAssigned) {
          assignedTo.push({
            username: selectedUser,
            fullName:
              `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              selectedUser,
            imgURL: user.employee_photo || "",
          });
          await prisma.role.update({
            where: { id: roleDoc.id },
            data: { assignedTo },
          });
        }
      }
    }

    const oldPerms = user.permissions || [];
    const oldPermsSet = new Set(oldPerms);
    const newPermsSet = new Set(validPermissions);
    const addedPerms = validPermissions.filter(
      (p: string) => !oldPermsSet.has(p),
    );
    const addedCount = addedPerms.length;
    const removedCount = oldPerms.filter(
      (p: string) => !newPermsSet.has(p),
    ).length;

    // Notify the employee when a new permission is granted (fire-and-forget,
    // in-app + email) — not on removal, which is a lower-visibility change.
    const tenantId = getTenantId();
    if (addedCount > 0 && tenantId) {
      const message = `You've been granted ${addedCount} new permission${addedCount === 1 ? "" : "s"}: ${addedPerms.join(", ")}`;
      masterPrisma.tenant
        .findUnique({
          where: { id: tenantId },
          select: { name: true, helpEmail: true },
        })
        .then((tenant) => {
          const tenantName = tenant?.name ?? "your organisation";
          return notify({
            tenantId,
            event: "permissionsGranted",
            targetUser: user.id,
            inApp: {
              title: "Permissions Updated",
              message,
              eventType: "permission_notification",
              priority: "medium",
            },
            email: user.email
              ? {
                  to: user.email,
                  subject: "You've been granted new permissions",
                  html: renderEmailHtml({
                    title: "Permissions Updated",
                    tenantName,
                    bodyHtml: `<h2>Hello ${user.username},</h2><p>${message}</p>`,
                  }),
                  from: tenantFrom(tenantName),
                  replyTo: tenantReplyTo(tenant?.helpEmail),
                }
              : undefined,
          });
        })
        .catch((error: unknown) =>
          logger.warn("permissions-granted notify failed", { error }),
        );
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "User permissions updated successfully",
      data: { addedCount, removedCount },
    });
  } catch (error: unknown) {
    logger.error("save-user-permissions error:", { error });
    return handleError(res, error);
  }
}

export async function getUserPermissions(req: Request, res: Response) {
  try {
    const user = await prisma.user.findFirst({
      where: { username: String(req.params.username) },
      select: { permissions: true, role: true },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { permissions: user?.permissions ?? [], role: user?.role ?? [] },
    });
  } catch (error: unknown) {
    logger.error("get-user-permissions error:", { error });
    return handleError(res, error);
  }
}

export async function updateSuperuser(req: Request, res: Response) {
  try {
    const { isSuperUser } = req.body;
    const user = await prisma.user.findFirst({
      where: { username: String(req.params.username) },
    });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuperUser: !!isSuperUser },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Superuser status ${isSuperUser ? "granted" : "revoked"} successfully`,
    });
  } catch (error: unknown) {
    logger.error("update-superuser error:", { error });
    return handleError(res, error);
  }
}

export async function deleteUserRole(req: Request, res: Response) {
  try {
    const { username, roleId } = req.body;
    const [role, user] = await Promise.all([
      prisma.role.findUnique({ where: { id: roleId } }),
      prisma.user.findFirst({ where: { username } }),
    ]);
    if (!role)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Role not found",
      });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const roleName = role.name || "";
    if (!user.role.includes(roleName))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "User does not have this role",
      });

    const updatedRoles = user.role.filter((r: any) => r !== roleName);
    const rolePermSet = new Set(role.permissions);
    const updatedPerms = user.permissions.filter(
      (p: any) => !rolePermSet.has(p),
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { role: updatedRoles, permissions: updatedPerms },
    });

    const assignedTo = Array.isArray(role.assignedTo)
      ? (role.assignedTo as any[])
      : [];
    const newAssignedTo = assignedTo.filter(
      (a: any) => a.username !== username,
    );
    await prisma.role.update({
      where: { id: role.id },
      data: { assignedTo: newAssignedTo },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Removed ${username} from role ${roleName}`,
      data: {
        removedRole: roleName,
        removedPermissions: role.permissions,
        updatedUser: {
          username,
          role: updatedRoles,
          permissions: updatedPerms,
        },
      },
    });
  } catch (error: unknown) {
    logger.error("delete-user-role error:", { error });
    return handleError(res, error);
  }
}

// Shared by getTeams and getOrgChart — resolves the raw ObjectId strings
// stored on Team.teamLeaderId/members into display-ready
// {username, name, designation, employeePhoto} so neither the Teams admin
// page nor the org chart has to show bare IDs.
async function resolveUserNames(ids: string[]): Promise<
  Map<
    string,
    {
      username: string;
      name: string;
      designation: string | null;
      employeePhoto: string | null;
    }
  >
> {
  const uniqueIds = [...new Set(ids)];
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      username: true,
      first_name: true,
      last_name: true,
      designation: true,
      employee_photo: true,
    },
  });
  return new Map(
    users.map((u: any) => [
      u.id,
      {
        username: u.username,
        name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username,
        designation: u.designation ?? null,
        employeePhoto: u.employee_photo ?? null,
      },
    ]),
  );
}

export async function getTeams(_req: Request, res: Response) {
  try {
    const teams = await prisma.team.findMany();
    const nameById = await resolveUserNames(
      teams.flatMap((t: any) => [t.teamLeaderId, ...t.members]),
    );
    const describe = (id: string) =>
      nameById.get(id) ?? {
        username: id,
        name: id,
        designation: null,
        employeePhoto: null,
      };

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: teams.map((t: any) => ({
        _id: t.id,
        teamName: t.teamName,
        teamLeaderId: t.teamLeaderId,
        teamLeaderName: describe(t.teamLeaderId).name,
        members: t.members,
        membersInfo: t.members.map((id: string) => ({
          id,
          ...describe(id),
        })),
      })),
    });
  } catch (error: unknown) {
    logger.error("get-teams error:", { error });
    return handleError(res, error);
  }
}

// GET /api/v1/get-org-chart — CEO + every team (with resolved leader/member
// names), for the Organization Tree page. Replaces the previous client-side
// approach of grouping ALL employees by department/designation-substring
// matching (fragile — broke silently whenever a department had 0 or 2+
// "MANAGER"-titled people, and needlessly fetched the entire user list).
export async function getOrgChart(_req: Request, res: Response) {
  try {
    const [ceo, teams, activeUsers, totalEmployeeCount, statusGroups] =
      await Promise.all([
        prisma.user.findFirst({
          where: { designation: "CEO", employeeStatus: "Active" },
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            designation: true,
            department: true,
            employee_photo: true,
          },
        }),
        prisma.team.findMany(),
        // Needed to detect active employees who aren't in any team yet (e.g.
        // just-approved join requests that haven't been onboarded with a
        // department/designation) — otherwise they silently vanish from the
        // chart with no indication they exist.
        prisma.user.findMany({
          where: { employeeStatus: "Active" },
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            designation: true,
            department: true,
            employee_photo: true,
          },
        }),
        // "Total Employees" stat = every employee record regardless of status
        // (active/resigned/terminated/absconded), unlike the tree itself which
        // only ever shows active headcount.
        prisma.user.count(),
        // Breakdown backing the "Total Employees" stat card.
        prisma.user.groupBy({
          by: ["employeeStatus"],
          _count: { id: true },
        }),
      ]);

    const employeeStatusBreakdown = {
      active: 0,
      resigned: 0,
      terminated: 0,
      absconded: 0,
    };
    for (const group of statusGroups as any[]) {
      const count = group._count.id;
      if (group.employeeStatus === "Active")
        employeeStatusBreakdown.active = count;
      else if (group.employeeStatus === "Resigned")
        employeeStatusBreakdown.resigned = count;
      else if (group.employeeStatus === "Terminated")
        employeeStatusBreakdown.terminated = count;
      else if (group.employeeStatus === "Absconded")
        employeeStatusBreakdown.absconded = count;
    }

    const nameById = await resolveUserNames(
      teams.flatMap((t: any) => [t.teamLeaderId, ...t.members]),
    );
    const describe = (id: string) =>
      nameById.get(id) ?? {
        username: id,
        name: id,
        designation: null,
        employeePhoto: null,
      };

    const assignedIds = new Set<string>(
      teams.flatMap((t: any) => [t.teamLeaderId, ...t.members]),
    );
    if (ceo) assignedIds.add(ceo.id);

    const unassigned = activeUsers
      .filter((u: any) => !assignedIds.has(u.id))
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username,
        designation: u.designation ?? null,
        employeePhoto: u.employee_photo ?? null,
      }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        ceo: ceo
          ? {
              id: ceo.id,
              username: ceo.username,
              name:
                `${ceo.first_name ?? ""} ${ceo.last_name ?? ""}`.trim() ||
                ceo.username,
              designation: ceo.designation,
              department: ceo.department,
              employeePhoto: ceo.employee_photo ?? null,
            }
          : null,
        teams: teams.map((t: any) => ({
          _id: t.id,
          teamName: t.teamName,
          leader: { id: t.teamLeaderId, ...describe(t.teamLeaderId) },
          members: t.members.map((id: string) => ({
            id,
            ...describe(id),
          })),
        })),
        unassigned,
        totalEmployeeCount,
        employeeStatusBreakdown,
      },
    });
  } catch (error: unknown) {
    logger.error("get-org-chart error:", { error });
    return handleError(res, error);
  }
}

export async function createTeam(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      team_name,
      teamName,
      team_leader_id,
      teamLeaderId,
      members = [],
    } = req.body;
    const name = team_name || teamName;
    const leaderId = team_leader_id || teamLeaderId;
    if (!name || !leaderId)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Team name and team leader are required",
      });
    const existing = await prisma.team.findFirst({ where: { teamName: name } });
    if (existing)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Team with this name already exists",
      });
    const team = await prisma.team.create({
      data: {
        tenantId: user!.tenantId!,
        teamName: name,
        teamLeaderId: leaderId,
        members,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Team created successfully",
      data: { teamId: team.id },
    });
  } catch (error: unknown) {
    logger.error("create-team error:", { error });
    return handleError(res, error);
  }
}

export async function deleteTeam(req: Request, res: Response) {
  try {
    const team = await prisma.team.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!team)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Team not found",
      });
    await prisma.team.delete({ where: { id: String(req.params._id) } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Team deleted successfully",
    });
  } catch (error: unknown) {
    logger.error("delete-team error:", { error });
    return handleError(res, error);
  }
}

export async function addTeamMembers(req: Request, res: Response) {
  try {
    const { teamId, members = [] } = req.body;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Team not found",
      });
    const alreadyIn = members.filter((m: string) => team.members.includes(m));
    if (alreadyIn.length > 0)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Users already in team: ${alreadyIn.join(", ")}`,
      });
    await prisma.team.update({
      where: { id: teamId },
      data: { members: { push: members } },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Team members added successfully",
    });
  } catch (error: unknown) {
    logger.error("add-team-members error:", { error });
    return handleError(res, error);
  }
}

export async function deleteUserFromTeam(req: Request, res: Response) {
  try {
    const { teamId, userId } = req.body;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Team not found",
      });
    if (!team.members.includes(userId))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "User is not a member of this team",
      });
    await prisma.team.update({
      where: { id: teamId },
      data: { members: team.members.filter((m: any) => m !== userId) },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "User removed from team successfully",
    });
  } catch (error: unknown) {
    logger.error("delete-user-from-team error:", { error });
    return handleError(res, error);
  }
}
