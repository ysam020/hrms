import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import PeopleIcon from "@mui/icons-material/People";
import useUserList from "@web/shared/hooks/useUserList";
import { AutoComplete } from "primereact/autocomplete";
import debounce from "lodash/debounce";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import { API_ENDPOINTS } from "@web/shared/constants";

function AddTeamMembersModal(props) {
  const { setAlert } = useContext(AlertContext);
  const userList = useUserList();
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);

  // Team membership is exclusive — don't offer users who are already on
  // some team (the caller computes this across all teams).
  const availableUserList = useMemo(() => {
    if (!props.assignedUserIds || !userList) return userList;
    return userList.filter((user) => !props.assignedUserIds.has(user.value));
  }, [userList, props.assignedUserIds]);

  const handleSearch = useCallback(
    (query: string) => {
      if (!availableUserList || !Array.isArray(availableUserList)) {
        setFilteredUsers([]);
        return;
      }

      const lowerQuery = query.toLowerCase();
      setFilteredUsers(
        availableUserList.filter((user) =>
          user.label.toLowerCase().includes(lowerQuery),
        ),
      );
    },
    [availableUserList],
  );

  const debouncedSearchUsers = useMemo(
    () => debounce(handleSearch, 300),
    [handleSearch],
  );

  useEffect(() => {
    return () => {
      debouncedSearchUsers.cancel();
    };
  }, [debouncedSearchUsers]);

  const formik = useFormik({
    initialValues: {
      members: [] as { value: string; label: string }[],
    },
    onSubmit: async (values, { resetForm }) => {
      if (!values.members || values.members.length === 0) {
        setAlert({
          open: true,
          message: "Please select at least one team member",
          severity: "warning",
        });
        return;
      }

      try {
        const res = await apiClient.put(API_ENDPOINTS.ADD_TEAM_MEMBERS, {
          members: values.members.map((member) => member.value),
          teamId: props._id,
        });

        setAlert({
          open: true,
          message: res.data?.message || "Team members added successfully",
          severity: "success",
        });
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "An error occurred",
          severity: "error",
        });
      } finally {
        resetForm();
        props.getData && props.getData();
        props.handleClose();
      }
    },
  });

  const modalStyle = {
    width: { xs: "90%", sm: 520 },
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disablePortal
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              p: 0.75,
              bgcolor: "success.main",
              color: "success.contrastText",
              borderRadius: 1.5,
              display: "flex",
            }}
          >
            <GroupAddIcon fontSize="small" />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Add Team Members
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PeopleIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {props.teamName || "Team Management"}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Form */}
      <Box sx={{ p: 2.5, pt: 0 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={2}>
            {/* Team Members Selection */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{
                  mb: 0.75,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <PeopleIcon sx={{ fontSize: 16 }} />
                Select Team Members
              </Typography>

              <AutoComplete
                value={formik.values.members}
                onChange={(e) => formik.setFieldValue("members", e.value)}
                suggestions={filteredUsers}
                completeMethod={(e) => debouncedSearchUsers(e.query)}
                field="label"
                placeholder="Search team members..."
                multiple
                dropdown
                // appendTo="self" renders inside this modal's animated
                // (transformed) wrapper, which breaks the panel's viewport
                // position calc — see ScheduleInterviewModal.tsx/HiringModal.tsx
                // for the same established fix — portal to the app root instead.
                appendTo={() =>
                  document.querySelector("#root .App") as HTMLElement
                }
                style={{ width: "100%" }}
                panelStyle={{ maxHeight: "200px" }}
              />

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.75, display: "block" }}
              >
                {formik.values.members.length > 0 &&
                  `${formik.values.members.length} selected · `}
                {availableUserList?.length || 0} users available
              </Typography>
            </Box>

            {/* Submit Button */}
            <Button type="submit" loading={formik.isSubmitting}>
              Add Selected Members
            </Button>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default memo(AddTeamMembersModal);
