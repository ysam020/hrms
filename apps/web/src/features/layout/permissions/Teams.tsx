import { memo, useCallback, useContext, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateTeamModal from "./CreateTeamModal";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import DataList from "@web/shared/components/DataList";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import AvatarGroup from "@mui/material/AvatarGroup";
import Popover from "@mui/material/Popover";
import CircularProgress from "@mui/material/CircularProgress";
import DeleteIcon from "@mui/icons-material/Delete";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import StarIcon from "@mui/icons-material/Star";
import AddTeamMembersModal from "./AddTeamMembersModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import PeopleIcon from "@mui/icons-material/People";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

function Teams() {
  const [openCreateTeam, setOpenCreateTeam] = useState(false);
  const [openAddTeamMembers, setOpenAddTeamMembers] = useState(false);
  const [teamData, setTeamData] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<any>(null);
  const { setAlert } = useContext(AlertContext);
  const [teamDeleteDialog, setTeamDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
    name: string;
  }>({
    open: false,
    id: null,
    name: "",
  });
  const [teamDeleteLoading, setTeamDeleteLoading] = useState(false);
  const [memberDeleteDialog, setMemberDeleteDialog] = useState<{
    open: boolean;
    userId: string | null;
    displayName: string;
    teamId: string | null;
  }>({
    open: false,
    userId: null,
    displayName: "",
    teamId: null,
  });
  const [memberDeleteLoading, setMemberDeleteLoading] = useState(false);

  // Popover state
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [popoverData, setPopoverData] = useState<any[]>([]);

  // Fetch teams using custom hook
  const { data: teams, refetch } = useFetchData(
    "/get-teams",
    "get",
    [],
    null,
    "Error loading teams",
  );

  const handleAvatarGroupClick = (
    event,
    users,
    teamId,
    teamName,
    teamLeader,
  ) => {
    setAnchorEl(event.currentTarget);
    setPopoverData(users);
    setTeamData({ id: teamId, name: teamName, leader: teamLeader });
  };

  const handlePopoverClose = useCallback(() => {
    setAnchorEl(null);
    setPopoverData([]);
  }, []);

  const isPopoverOpen = Boolean(anchorEl);

  const handleOpenCreateTeam = useCallback(() => setOpenCreateTeam(true), []);
  const handleCloseCreateTeam = useCallback(() => setOpenCreateTeam(false), []);
  const handleOpenAddTeamMembers = useCallback((teamId) => {
    setOpenAddTeamMembers(true);
    setSelectedTeamId(teamId);
  }, []);
  const handleCloseAddTeamMembers = useCallback(() => {
    setOpenAddTeamMembers(false);
    setSelectedTeamId(null);
  }, []);

  const handleTeamDeleteClick = useCallback((id, name) => {
    setTeamDeleteDialog({ open: true, id, name });
  }, []);

  const handleTeamDeleteCancel = useCallback(() => {
    setTeamDeleteDialog({ open: false, id: null, name: "" });
  }, []);

  const handleTeamDeleteConfirm = useCallback(async () => {
    setTeamDeleteLoading(true);
    try {
      await apiClient.delete(API_ENDPOINTS.DELETE_TEAM(teamDeleteDialog.id!));
      refetch();
      setTeamDeleteDialog({ open: false, id: null, name: "" });
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, please try again when online"
            : error.response?.data?.message || "Error deleting team",
        severity: "error",
      });
    } finally {
      setTeamDeleteLoading(false);
    }
  }, [teamDeleteDialog.id, refetch, setAlert]);

  const handleMemberDeleteClick = useCallback(
    (userId: string, displayName: string, teamId: string) => {
      setMemberDeleteDialog({ open: true, userId, displayName, teamId });
    },
    [],
  );

  const handleMemberDeleteCancel = useCallback(() => {
    setMemberDeleteDialog({
      open: false,
      userId: null,
      displayName: "",
      teamId: null,
    });
  }, []);

  const handleMemberDeleteConfirm = useCallback(async () => {
    setMemberDeleteLoading(true);
    setDeletingUser(memberDeleteDialog.userId);
    try {
      await apiClient.post(API_ENDPOINTS.DELETE_USER_FROM_TEAM, {
        userId: memberDeleteDialog.userId,
        teamId: memberDeleteDialog.teamId,
      });
      refetch();
      handlePopoverClose();
      setMemberDeleteDialog({
        open: false,
        userId: null,
        displayName: "",
        teamId: null,
      });
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

  const columns = useMemo(
    () => [
      {
        key: "teamName",
        label: "Name of Team",
        primary: true,
        hideLabel: true,
      },
      {
        key: "members",
        label: "Members",
        render: (row: any) => {
          const members = row.membersInfo as
            | { id: string; name: string; username: string }[]
            | undefined;
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
                  row._id,
                  row.teamName,
                  row.teamLeaderId,
                )
              }
              sx={{
                cursor: "pointer",
                "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 12 },
              }}
            >
              {members.map((m) => (
                <Avatar
                  key={m.id}
                  alt={m.name}
                  sx={{ width: 28, height: 28 }}
                />
              ))}
            </AvatarGroup>
          );
        },
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => [
      {
        icon: <GroupAddIcon fontSize="small" />,
        label: "Add Team Members",
        color: "primary" as const,
        onClick: () => handleOpenAddTeamMembers(row._id),
      },
      {
        icon: <DeleteIcon fontSize="small" />,
        label: "Delete team",
        color: "error" as const,
        onClick: () => handleTeamDeleteClick(row._id, row.teamName),
      },
    ],
    [handleTeamDeleteClick, handleOpenAddTeamMembers],
  );

  return (
    <div>
      <DataList
        ariaLabel="Teams"
        data={teams || []}
        columns={columns}
        actions={rowActions}
        emptyMessage="No teams found"
        toolbarActions={
          <IconButton
            onClick={handleOpenCreateTeam}
            aria-label="Create new team"
          >
            <AddIcon aria-hidden="true" />
          </IconButton>
        }
      />
      <CreateTeamModal
        open={openCreateTeam}
        handleClose={handleCloseCreateTeam}
        getData={refetch}
      />

      <AddTeamMembersModal
        open={openAddTeamMembers}
        handleClose={handleCloseAddTeamMembers}
        getData={refetch}
        _id={selectedTeamId}
      />

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
                {teamData?.name} Members
              </Typography>
            </Box>
            <IconButton
              onClick={handlePopoverClose}
              size="small"
              aria-label="Close team members panel"
            >
              <CloseIcon aria-hidden="true" fontSize="small" />
            </IconButton>
          </Box>

          {/* User List */}
          <Box sx={{ maxHeight: 280, overflow: "auto" }}>
            {popoverData.map((user) => {
              const isTeamLeader = user.id === teamData?.leader;

              return (
                <Box
                  key={user.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.5,
                    backgroundColor: isTeamLeader
                      ? "rgba(255, 193, 7, 0.1)"
                      : "transparent",
                    borderLeft: isTeamLeader
                      ? "3px solid #FFC107"
                      : "3px solid transparent",
                  }}
                >
                  <Box sx={{ position: "relative" }}>
                    <Avatar
                      alt={user.name}
                      sx={{
                        width: 36,
                        height: 36,
                        border: isTeamLeader ? "2px solid #FFC107" : "none",
                      }}
                    />
                    {isTeamLeader && (
                      <StarIcon
                        sx={{
                          position: "absolute",
                          top: -4,
                          right: -4,
                          fontSize: 16,
                          color: "#FFC107",
                          backgroundColor: "white",
                          borderRadius: "50%",
                          padding: "1px",
                        }}
                      />
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isTeamLeader ? 700 : 600,
                          fontSize: "0.875rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: isTeamLeader ? "#F57C00" : "inherit",
                        }}
                      >
                        {user.name}
                      </Typography>
                      {isTeamLeader && (
                        <StarIcon
                          sx={{
                            fontSize: 14,
                            color: "#FFC107",
                            ml: 0.5,
                          }}
                        />
                      )}
                    </Box>
                    {isTeamLeader && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#F57C00",
                          fontWeight: 500,
                          fontSize: "0.75rem",
                        }}
                      >
                        Team Leader
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    onClick={() =>
                      handleMemberDeleteClick(user.id, user.name, teamData?.id)
                    }
                    disabled={deletingUser === user.id || isTeamLeader}
                    size="small"
                    aria-label={`Remove ${user.name} from team`}
                    sx={{
                      color: isTeamLeader
                        ? "rgba(241, 92, 109, 0.3)"
                        : "#F15C6D",
                      backgroundColor: isTeamLeader
                        ? "rgba(241, 92, 109, 0.05)"
                        : "rgba(241, 92, 109, 0.1)",
                      border: `1px solid ${
                        isTeamLeader
                          ? "rgba(241, 92, 109, 0.1)"
                          : "rgba(241, 92, 109, 0.2)"
                      }`,
                      "&:hover": {
                        backgroundColor: isTeamLeader
                          ? "rgba(241, 92, 109, 0.05)"
                          : "rgba(241, 92, 109, 0.15)",
                        borderColor: isTeamLeader
                          ? "rgba(241, 92, 109, 0.1)"
                          : "rgba(241, 92, 109, 0.3)",
                      },
                      "&:disabled": {
                        backgroundColor: "rgba(241, 92, 109, 0.05)",
                        borderColor: "rgba(241, 92, 109, 0.1)",
                      },
                    }}
                    title={
                      isTeamLeader
                        ? "Cannot delete team leader"
                        : "Remove from team"
                    }
                  >
                    {deletingUser === user.id ? (
                      <CircularProgress size={16} sx={{ color: "#F15C6D" }} />
                    ) : (
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Box>
              );
            })}
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
              <Typography variant="body2">No members in this team</Typography>
            </Box>
          )}
        </Box>
      </Popover>

      <ConfirmationDialog
        open={teamDeleteDialog.open}
        onClose={handleTeamDeleteCancel}
        onConfirm={handleTeamDeleteConfirm}
        title="Delete Team"
        message={`Are you sure you want to delete the team "${teamDeleteDialog.name}"?`}
        description="All team members will be removed from this team. This action cannot be undone."
        confirmText="Delete Team"
        cancelText="Cancel"
        loading={teamDeleteLoading}
        variant="danger"
      />

      <ConfirmationDialog
        open={memberDeleteDialog.open}
        onClose={handleMemberDeleteCancel}
        onConfirm={handleMemberDeleteConfirm}
        title="Remove Team Member"
        message={`Are you sure you want to remove "${memberDeleteDialog.displayName}" from this team?`}
        confirmText="Remove"
        cancelText="Cancel"
        loading={memberDeleteLoading}
        variant="danger"
      />
    </div>
  );
}

export default memo(Teams);
