import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
} from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateTeamModal from "./CreateTeamModal";
import apiClient from "../../../config/axiosConfig";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "../../../hooks/useTableConfig";
import { getTableColumns } from "../../../utils/table/getTableColumns";
import {
  IconButton,
  Avatar,
  AvatarGroup,
  Popover,
  List,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddTeamMembersModal from "./AddTeamMembersModal";
import { AlertContext } from "../../../contexts/AlertContext";

function Teams() {
  const [openCreateTeam, setOpenCreateTeam] = useState(false);
  const [openAddTeamMembers, setOpenAddTeamMembers] = useState(false);
  const [teamData, setTeamData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [deletingUser, setDeletingUser] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const { setAlert } = useContext(AlertContext);

  // Popover state
  const [anchorEl, setAnchorEl] = useState(null);
  const [popoverData, setPopoverData] = useState([]);

  const handleAvatarGroupClick = (event, users, teamId, teamName) => {
    setAnchorEl(event.currentTarget);
    setPopoverData(users);
    setTeamData({ id: teamId, name: teamName });
  };

  const handlePopoverClose = useCallback(() => {
    setAnchorEl(null);
    setPopoverData([]);
  }, []);

  const isPopoverOpen = Boolean(anchorEl);

  const handleOpenCreateTeam = useCallback(() => setOpenCreateTeam(true), []);
  const handleCloseCreateTeam = useCallback(() => setOpenCreateTeam(false), []);
  const handleOpenAddTeamMembers = useCallback((teamId, teamName) => {
    setOpenAddTeamMembers(true);
    setSelectedTeamId(teamId);
  }, []);
  const handleCloseAddTeamMembers = useCallback(() => {
    setOpenAddTeamMembers(false);
    setSelectedTeamId(null);
  }, []);

  const getData = useCallback(async () => {
    try {
      const res = await apiClient("/get-teams");
      setTeams(res.data);
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    }
    // eslint-disable-next-line
  }, []);

  const deleteTeam = useCallback(
    async (id) => {
      try {
        await apiClient.delete(`/delete-team/${id}`);
        getData();
      } catch (error) {
        console.error("Error deleting team:", error);
      }
    },
    [getData]
  );

  const deleteUserFromTeam = useCallback(
    async (username, teamId) => {
      setDeletingUser(username);
      try {
        await apiClient.post(`/delete-user-from-team`, { username, teamId });
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
      { accessorKey: "team_name", header: "Name of Team" },
      {
        accessorKey: "members",
        header: "Members",
        Cell: ({ cell }) => {
          const members = cell.row.original.members;

          if (!Array.isArray(members) || members.length === 0)
            return "No members assigned";

          return (
            <AvatarGroup
              spacing="medium"
              total={members.length}
              onClick={(e) =>
                handleAvatarGroupClick(
                  e,
                  members,
                  cell.row.original._id,
                  cell.row.original.team_name
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
              {members.map((user) => (
                <Avatar key={user} alt={user} sx={{ width: 28, height: 28 }} />
              ))}
            </AvatarGroup>
          );
        },
      },
      {
        accessorKey: "manage",
        header: "Manage",
        Cell: ({ cell }) => {
          return (
            <>
              <span
                className="link approve-link"
                onClick={() => handleOpenAddTeamMembers(cell.row.original._id)}
              >
                Add Team Members
              </span>
              <span
                className="link reject-link"
                onClick={() => deleteTeam(cell.row.original._id)}
              >
                Delete
              </span>
            </>
          );
        },
      },
    ],
    // eslint-disable-next-line
    [deleteTeam]
  );

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);
  const baseConfig = useTableConfig(teams, columns);

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
            <IconButton onClick={handleOpenCreateTeam}>
              <AddIcon />
            </IconButton>
          </div>
        ),
      }),
      [baseConfig, handleOpenCreateTeam]
    )
  );

  return (
    <div>
      <MaterialReactTable table={table} />
      <CreateTeamModal
        open={openCreateTeam}
        handleClose={handleCloseCreateTeam}
        getData={getData}
      />

      <AddTeamMembersModal
        open={openAddTeamMembers}
        handleClose={handleCloseAddTeamMembers}
        getData={getData}
        _id={selectedTeamId}
      />

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
              key={user}
              className="flex-div"
              style={{ gap: "10px", marginBottom: "10px" }}
            >
              <Avatar alt={user} sx={{ width: 28, height: 28 }} />
              <span style={{ flex: 1 }}>{user}</span>
              <IconButton
                onClick={() => deleteUserFromTeam(user, teamData?.id)}
                disabled={deletingUser === user}
              >
                {deletingUser === user ? (
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

export default React.memo(Teams);
