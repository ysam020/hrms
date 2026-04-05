import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

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
  } catch (err) {
    logger.error("get-roles error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function createRole(req: Request, res: Response) {
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
      data: { name, permissions: [], assignedTo: [] },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Role created successfully",
      data: { roleId: role.id },
    });
  } catch (err) {
    logger.error("create-role error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to create role",
    });
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
  } catch (err) {
    logger.error("delete-role error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to delete role",
    });
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
    await prisma.role.update({
      where: { id: String(req.params._id) },
      data: { permissions: permissions ?? [] },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Role permissions updated successfully",
    });
  } catch (err) {
    logger.error("update-role-permissions error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to update role permissions",
    });
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
  } catch (err) {
    logger.error("get-role-permissions error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to get role permissions",
    });
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
  } catch (err) {
    logger.error("get-role-and-permissions error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
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
      data: { permissions: permissions ?? [], role: updatedRole },
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
    const addedCount = (permissions ?? []).filter(
      (p: string) => !oldPerms.includes(p),
    ).length;
    const removedCount = oldPerms.filter(
      (p: string) => !(permissions ?? []).includes(p),
    ).length;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "User permissions updated successfully",
      data: { addedCount, removedCount },
    });
  } catch (err) {
    logger.error("save-user-permissions error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to save user permissions",
    });
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
  } catch (err) {
    logger.error("get-user-permissions error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { permissions: [], role: [] },
    });
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
  } catch (err) {
    logger.error("update-superuser error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to update superuser status",
    });
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
  } catch (err) {
    logger.error("delete-user-role error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to remove user role",
    });
  }
}

export async function getTeams(_req: Request, res: Response) {
  try {
    const teams = await prisma.team.findMany();
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: teams.map((t: any) => ({
        _id: t.id,
        teamName: t.teamName,
        teamLeader: t.teamLeader,
        members: t.members,
      })),
    });
  } catch (err) {
    logger.error("get-teams error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function createTeam(req: Request, res: Response) {
  try {
    const {
      team_name,
      teamName,
      team_leader,
      teamLeader,
      members = [],
    } = req.body;
    const name = team_name || teamName;
    const leader = team_leader || teamLeader;
    if (!name || !leader)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Team name and team leader are required",
      });
    const existing = await prisma.team.findFirst({ where: { teamName: name } });
    if (existing)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Team with this name already exists",
      });
    const team = await prisma.team.create({
      data: { teamName: name, teamLeader: leader, members },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Team created successfully",
      data: { teamId: team.id },
    });
  } catch (err) {
    logger.error("create-team error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to create team",
    });
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
  } catch (err) {
    logger.error("delete-team error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to delete team",
    });
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
  } catch (err) {
    logger.error("add-team-members error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to add team members",
    });
  }
}

export async function deleteUserFromTeam(req: Request, res: Response) {
  try {
    const { teamId, username } = req.body;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Team not found",
      });
    if (!team.members.includes(username))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "User is not a member of this team",
      });
    await prisma.team.update({
      where: { id: teamId },
      data: { members: team.members.filter((m: any) => m !== username) },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "User removed from team successfully",
    });
  } catch (err) {
    logger.error("delete-user-from-team error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to remove user from team",
    });
  }
}
