import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
} from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateRoleModal from "./CreateRoleModal";
import apiClient from "../../../config/axiosConfig";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "../../../hooks/useTableConfig";
import { getTableColumns } from "../../../utils/table/getTableColumns";
import {
  IconButton,
  Skeleton,
  Avatar,
  AvatarGroup,
  Popover,
  List,
  CircularProgress,
} from "@mui/material";
import RolePermissionsModal from "./RolePermissionsModal";
import DeleteIcon from "@mui/icons-material/Delete";
import { AlertContext } from "../../../contexts/AlertContext";

function ManageRoles() {
  const [openCreateRole, setOpenCreateRole] = useState(false);
  const [openRolePermissions, setOpenRolePermissions] = useState(false);
  const [roleData, setRoleData] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const { setAlert } = useContext(AlertContext);

  // Popover state
  const [anchorEl, setAnchorEl] = useState(null);
  const [popoverData, setPopoverData] = useState([]);

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

  const getData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient("/get-roles");
      setRoles(res.data);
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
      setLoading(false);
    }
    // eslint-disable-next-line
  }, []);

  const deleteRole = useCallback(
    async (id) => {
      try {
        await apiClient.delete(`/delete-role/${id}`);
        getData();
      } catch (error) {
        console.error("Error deleting role:", error);
      }
    },
    [getData]
  );

  const deleteUserRole = useCallback(
    async (username, roleId) => {
      setDeletingUser(username);
      try {
        await apiClient.post(`/delete-user-role`, { username, roleId });
        getData();
        handlePopoverClose();
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
      }
    },
    // eslint-disable-next-line
    [getData, handlePopoverClose]
  );

  useEffect(() => {
    getData();
  }, [getData]);

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
                  cell.row.original.name
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
                    cell.row.original.name
                  )
                }
              >
                Manage Permissions
              </span>
              <span
                className="link reject-link"
                onClick={() => deleteRole(cell.row.original._id)}
              >
                Delete
              </span>
            </>
          );
        },
      },
    ],
    [loading, handleOpenRolePermissions, deleteRole]
  );

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);
  const baseConfig = useTableConfig(roles, columns, loading);

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
      [baseConfig, handleOpenCreateRole]
    )
  );

  return (
    <div>
      <MaterialReactTable table={table} />
      <CreateRoleModal
        open={openCreateRole}
        handleClose={handleCloseCreateRole}
        getData={getData}
      />
      {roleData && (
        <RolePermissionsModal
          open={openRolePermissions}
          handleClose={handleCloseRolePermissions}
          roleId={roleData.id}
          roleName={roleData.name}
          onPermissionsSaved={getData}
        />
      )}
      <Popover
        open={isPopoverOpen}
        anchorEl={anchorEl}
        onClose={handlePopoverClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        <List dense sx={{ minWidth: 500 }}>
          {popoverData.map((user) => (
            <div
              key={user.username}
              className="flex-div"
              style={{ gap: "10px", marginBottom: "10px" }}
            >
              <Avatar
                src={user.imageURL}
                alt={user.fullName}
                sx={{ width: 28, height: 28 }}
              />
              <span style={{ flex: 1 }}>
                {user.fullName} ({user.username})
              </span>
              <IconButton
                onClick={() => deleteUserRole(user.username, roleData?.id)}
                disabled={deletingUser === user.username}
              >
                {deletingUser === user.username ? (
                  <CircularProgress size={20} />
                ) : (
                  <DeleteIcon sx={{ color: "#F15C6D" }} />
                )}
              </IconButton>
            </div>
          ))}
        </List>
      </Popover>
    </div>
  );
}

export default React.memo(ManageRoles);
