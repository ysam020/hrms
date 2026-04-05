import React, { useState, useMemo, useCallback, useContext } from "react";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import AddIcon from "@mui/icons-material/Add";
import CreateRoleModal from "./CreateRoleModal";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import { getTableColumns } from "@web/shared/utils/table/getTableColumns";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import AvatarGroup from "@mui/material/AvatarGroup";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import RolePermissionsModal from "./RolePermissionsModal";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import PeopleIcon from "@mui/icons-material/People";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

function ManageRoles() {
  const [openCreateRole, setOpenCreateRole] = useState(false);
  const [openRolePermissions, setOpenRolePermissions] = useState(false);
  const [roleData, setRoleData] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const { setAlert } = useContext(AlertContext);
  const [roleDeleteDialog, setRoleDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
    name: string;
  }>({
    open: false,
    id: null,
    name: "",
  });
  const [roleDeleteLoading, setRoleDeleteLoading] = useState(false);
  const [memberDeleteDialog, setMemberDeleteDialog] = useState({
    open: false,
    username: null,
    roleId: null,
  });
  const [memberDeleteLoading, setMemberDeleteLoading] = useState(false);

  // Popover state
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [popoverData, setPopoverData] = useState<any[]>([]);

  const {
    data: roles,
    loading,
    refetch,
  } = useFetchData("/get-roles", "get", [], null, "Error loading roles");

  const handleAvatarGroupClick = (event, users, roleId, roleName) => {
    setAnchorEl(event.currentTarget);
    setPopoverData(users);
    setRoleData({ id: roleId, name: roleName });
  };

  const handlePopoverClose = useCallback(() => {
    setAnchorEl(null);
    setPopoverData([]);
  }, []);

  const isPopoverOpen = Boolean(anchorEl);

  const handleOpenCreateRole = useCallback(() => setOpenCreateRole(true), []);
  const handleCloseCreateRole = useCallback(() => setOpenCreateRole(false), []);

  const handleOpenRolePermissions = useCallback((id, name) => {
    setOpenRolePermissions(true);
    setRoleData({ id, name });
  }, []);

  const handleCloseRolePermissions = useCallback(() => {
    setRoleData(null);
    setOpenRolePermissions(false);
  }, []);

  const handleRoleDeleteClick = useCallback((id, name) => {
    setRoleDeleteDialog({ open: true, id, name });
  }, []);

  const handleRoleDeleteCancel = useCallback(() => {
    setRoleDeleteDialog({ open: false, id: null, name: "" });
  }, []);

  const handleRoleDeleteConfirm = useCallback(async () => {
    setRoleDeleteLoading(true);
    try {
      await apiClient.delete(API_ENDPOINTS.DELETE_ROLE(roleDeleteDialog.id!));
      refetch();
      setRoleDeleteDialog({ open: false, id: null, name: "" });
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, please try again when online"
            : error.response?.data?.message || "Error deleting role",
        severity: "error",
      });
    } finally {
      setRoleDeleteLoading(false);
    }
  }, [roleDeleteDialog.id, refetch, setAlert]);

  const handleMemberDeleteClick = useCallback((username, roleId) => {
    setMemberDeleteDialog({ open: true, username, roleId });
  }, []);

  const handleMemberDeleteCancel = useCallback(() => {
    setMemberDeleteDialog({ open: false, username: null, roleId: null });
  }, []);

  const handleMemberDeleteConfirm = useCallback(async () => {
    setMemberDeleteLoading(true);
    setDeletingUser(memberDeleteDialog.username);
    try {
      await apiClient.post(API_ENDPOINTS.DELETE_USER_ROLE, {
        username: memberDeleteDialog.username,
        roleId: memberDeleteDialog.roleId,
      });
      refetch();
      handlePopoverClose();
      setMemberDeleteDialog({ open: false, username: null, roleId: null });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    } finally {
      setDeletingUser(null);
      setMemberDeleteLoading(false);
    }
  }, [memberDeleteDialog, refetch, handlePopoverClose, setAlert]);

  const baseColumns = useMemo(
    () => [
      { accessorKey: "name", header: "Name of Role" },
      {
        accessorKey: "assignedTo",
        header: "Assigned To",
        Cell: ({ cell }) => {
          const users = cell.row.original.assignedTo;

          if (!Array.isArray(users) || users.length === 0)
            return "No users assigned";

          return (
            <AvatarGroup
              spacing="medium"
              total={users.length}
              onClick={(e) =>
                handleAvatarGroupClick(
                  e,
                  users,
                  cell.row.original._id,
                  cell.row.original.name,
                )
              }
              sx={{
                cursor: "pointer",
                "& .MuiAvatar-root": {
                  width: 28,
                  height: 28,
                  fontSize: 12,
                },
              }}
            >
              {users.map((user) => (
                <Avatar
                  key={user.username}
                  alt={user.fullName}
                  src={user.imageURL}
                  sx={{ width: 28, height: 28 }}
                />
              ))}
            </AvatarGroup>
          );
        },
      },
      {
        accessorKey: "manage",
        header: "Manage",
        Cell: ({ cell }) => {
          if (loading) {
            return (
              <div style={{ display: "flex", gap: "10px" }}>
                <Skeleton width={150} height={30} />
                <Skeleton width={70} height={30} />
              </div>
            );
          }

          return (
            <>
              <span
                className="link approve-link"
                onClick={() =>
                  handleOpenRolePermissions(
                    cell.row.original._id,
                    cell.row.original.name,
                  )
                }
              >
                Manage Permissions
              </span>
              <span
                className="link reject-link"
                onClick={() =>
                  handleRoleDeleteClick(
                    cell.row.original._id,
                    cell.row.original.name,
                  )
                }
              >
                Delete
              </span>
            </>
          );
        },
      },
    ],
    [loading, handleOpenRolePermissions, handleRoleDeleteClick],
  );

  const columns = useMemo(() => {
    if (!baseColumns || !Array.isArray(baseColumns)) {
      return [];
    }
    return getTableColumns(baseColumns);
  }, [baseColumns]);

  const { table: baseConfig } = useTableConfig(roles || [], columns, loading);

  const table = useMaterialReactTable(
    useMemo(
      () => ({
        ...baseConfig,
        renderTopToolbarCustomActions: () => (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              width: "100%",
            }}
          >
            <IconButton onClick={handleOpenCreateRole}>
              <AddIcon />
            </IconButton>
          </div>
        ),
      }),
      [baseConfig, handleOpenCreateRole],
    ),
  );

  return (
    <div>
      <MaterialReactTable table={table} />
      <CreateRoleModal
        open={openCreateRole}
        handleClose={handleCloseCreateRole}
        getData={refetch}
      />
      {roleData && (
        <RolePermissionsModal
          open={openRolePermissions}
          handleClose={handleCloseRolePermissions}
          roleId={roleData.id}
          roleName={roleData.name}
          onPermissionsSaved={refetch}
        />
      )}

      {/* Modern Compact Popover */}
      <Popover
        open={isPopoverOpen}
        anchorEl={anchorEl}
        onClose={handlePopoverClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        BackdropProps={{
          style: {
            backgroundColor: "transparent",
            backdropFilter: "none",
          },
        }}
        disableScrollLock={true}
        PaperProps={{
          elevation: 8,
          sx: {
            borderRadius: 3,
            minWidth: 320,
            maxWidth: 400,
            overflow: "visible",
            mt: 1,
            "&::before": {
              content: '""',
              display: "block",
              position: "absolute",
              top: 0,
              left: "50%",
              width: 12,
              height: 12,
              bgcolor: "background.paper",
              transform: "translateY(-50%) translateX(-50%) rotate(45deg)",
              zIndex: 0,
              border: "1px solid",
              borderColor: "divider",
              borderBottom: "none",
              borderRight: "none",
            },
          },
        }}
      >
        <Box sx={{ p: 0 }}>
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 2,
              pb: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PeopleIcon sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                {roleData?.name} Members
              </Typography>
            </Box>
            <IconButton onClick={handlePopoverClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* User List */}
          <Box sx={{ maxHeight: 280, overflow: "auto" }}>
            {popoverData.map((user) => (
              <Box
                key={user.username}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  p: 1.5,
                }}
              >
                <Avatar
                  src={user.imageURL}
                  alt={user.fullName}
                  sx={{
                    width: 36,
                    height: 36,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.fullName}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      opacity: 0.7,
                      fontSize: "0.75rem",
                    }}
                  >
                    @{user.username}
                  </Typography>
                </Box>
                <IconButton
                  onClick={() =>
                    handleMemberDeleteClick(user.username, roleData?.id)
                  }
                  disabled={deletingUser === user.username}
                  size="small"
                  sx={{
                    color: "#F15C6D",
                    backgroundColor: "rgba(241, 92, 109, 0.1)",
                    border: "1px solid rgba(241, 92, 109, 0.2)",
                    "&:hover": {
                      backgroundColor: "rgba(241, 92, 109, 0.15)",
                      borderColor: "rgba(241, 92, 109, 0.3)",
                    },
                    "&:disabled": {
                      backgroundColor: "rgba(241, 92, 109, 0.05)",
                      borderColor: "rgba(241, 92, 109, 0.1)",
                    },
                  }}
                >
                  {deletingUser === user.username ? (
                    <CircularProgress size={16} sx={{ color: "#F15C6D" }} />
                  ) : (
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Box>
            ))}
          </Box>

          {/* Empty State */}
          {popoverData.length === 0 && (
            <Box
              sx={{
                p: 3,
                textAlign: "center",
                opacity: 0.6,
              }}
            >
              <PeopleIcon sx={{ fontSize: 32, mb: 1, opacity: 0.5 }} />
              <Typography variant="body2">
                No users assigned to this role
              </Typography>
            </Box>
          )}
        </Box>
      </Popover>

      <ConfirmationDialog
        open={roleDeleteDialog.open}
        onClose={handleRoleDeleteCancel}
        onConfirm={handleRoleDeleteConfirm}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${roleDeleteDialog.name}"?`}
        description="All users assigned to this role will lose their permissions. This action cannot be undone."
        confirmText="Delete Role"
        cancelText="Cancel"
        loading={roleDeleteLoading}
        variant="danger"
      />

      <ConfirmationDialog
        open={memberDeleteDialog.open}
        onClose={handleMemberDeleteCancel}
        onConfirm={handleMemberDeleteConfirm}
        title="Remove User from Role"
        message={`Are you sure you want to remove "${memberDeleteDialog.username}" from this role?`}
        description="The user will lose all permissions associated with this role."
        confirmText="Remove"
        cancelText="Cancel"
        loading={memberDeleteLoading}
        variant="danger"
      />
    </div>
  );
}

export default React.memo(ManageRoles);
