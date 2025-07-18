import * as React from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import CircularProgress from "@mui/material/CircularProgress";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import NotesIcon from "@mui/icons-material/Notes";
import QueryBuilderIcon from "@mui/icons-material/QueryBuilder";
import CellTowerIcon from "@mui/icons-material/CellTower";
import DevicesIcon from "@mui/icons-material/Devices";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import apiClient from "../../config/axiosConfig";
import { Timeline } from "primereact/timeline";
import { Dropdown } from "primereact/dropdown";
import useUserList from "../../hooks/useUserList";
import { ThemeContext } from "../../contexts/ThemeContext";
import JsonView from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";
import { darkTheme } from "@uiw/react-json-view/dark";
import { timePresets } from "../../assets/data/timePresets";
import { entityOptions } from "../../assets/data/entityOptions";
import { getDeviceInfo } from "../../utils/getDeviceInfo";
import { AlertContext } from "../../contexts/AlertContext";

function ActivityDrawer(props) {
  const [filteredLogs, setFilteredLogs] = React.useState([]);
  const [selectedDays, setSelectedDays] = React.useState(1);
  const [selectedEntity, setSelectedEntity] = React.useState(null);
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [expandedLogId, setExpandedLogId] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const { setAlert } = React.useContext(AlertContext);

  const userList = useUserList();
  const { theme } = React.useContext(ThemeContext);

  React.useEffect(() => {
    let isMounted = true;

    async function fetchFilteredLogs() {
      if (!props.open) return;

      if (isMounted) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.append("days", selectedDays);

        if (typeof selectedEntity === "string" && selectedEntity.trim()) {
          params.append("entityType", selectedEntity);
        }

        if (typeof selectedUser === "string" && selectedUser.trim()) {
          params.append("userName", selectedUser);
        }

        const res = await apiClient.get(`/audit-logs?${params.toString()}`);

        // Only update state if component is still mounted
        if (isMounted) {
          setFilteredLogs(res.data);
        }
      } catch (err) {
        if (isMounted) {
          setAlert({
            open: true,
            message:
              err.message === "Network Error"
                ? "Network Error, your details will be submitted when you are back online"
                : err.response?.data?.message || "Something went wrong",
            severity: "error",
          });
          setFilteredLogs([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchFilteredLogs();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line
  }, [props.open, selectedDays, selectedEntity, selectedUser]);

  const toggleDetails = (logId) => {
    setExpandedLogId((prevId) => (prevId === logId ? null : logId));
  };

  const clearAllFilters = () => {
    setSelectedDays(1);
    setSelectedUser(null);
    setSelectedEntity(null);
  };

  const drawerContent = (
    <Box
      sx={{
        width: 1000,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ p: 3, pb: 0 }}>
        <div>
          <h2 style={{ letterSpacing: 1, fontSize: "30px" }}>Audit Logs</h2>
          <br />
          <div className="flex-div">
            <Dropdown
              value={selectedDays}
              options={timePresets}
              onChange={(e) => setSelectedDays(e.value)}
              placeholder="Select Time Range"
              optionLabel="label"
              appendTo="self"
              style={{ marginRight: "10px", zIndex: 1500 }}
              panelStyle={{ zIndex: 1500 }}
            />
            <Dropdown
              value={selectedUser}
              options={userList}
              onChange={(e) => setSelectedUser(e.value)}
              placeholder="Filter by User"
              optionLabel="label"
              appendTo="self"
              style={{ marginRight: "10px", zIndex: 1500 }}
              panelStyle={{ zIndex: 1500 }}
              showClear
            />
            <Dropdown
              value={selectedEntity}
              options={entityOptions}
              onChange={(e) => setSelectedEntity(e.value)}
              placeholder="Filter by Entity"
              optionLabel="label"
              appendTo="self"
              style={{ marginRight: "10px", zIndex: 1500 }}
              panelStyle={{ zIndex: 1500 }}
            />
            <IconButton onClick={clearAllFilters}>
              <FilterAltOffIcon />
            </IconButton>
          </div>
        </div>
      </Box>

      <Box sx={{ p: 3, pt: 2, flex: 1, overflow: "auto" }}>
        {loading ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
          </Box>
        ) : filteredLogs.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme === "light" ? "#555" : "#ccc",
              fontSize: "18px",
              textAlign: "center",
            }}
          >
            No activity logs found for the selected filters.
          </Box>
        ) : (
          <Timeline
            value={filteredLogs}
            content={(item) => {
              const hasDetails =
                !!item.details?.oldValue || !!item.details?.newValue;

              const deviceInfo = getDeviceInfo(item);

              return (
                <div
                  className="activity-log flex-div"
                  style={{ position: "relative" }}
                >
                  <div style={{ flex: 1 }}>
                    <span className="flex-div-secondary">
                      <NotesIcon sx={{ fontSize: "18px" }} />
                      <p>{item.description}</p>
                    </span>
                    <span className="flex-div-secondary">
                      <QueryBuilderIcon sx={{ fontSize: "18px" }} />
                      <p>{new Date(item.timestamp).toLocaleString()}</p>
                    </span>
                    <span className="flex-div-secondary">
                      <CellTowerIcon sx={{ fontSize: "18px" }} />
                      <p>{item.ipAddress}</p>
                    </span>
                    <span className="flex-div-secondary">
                      <DevicesIcon sx={{ fontSize: "18px" }} />
                      <p>{deviceInfo}</p>
                    </span>

                    {hasDetails && (
                      <Collapse
                        in={expandedLogId === item._id}
                        timeout="auto"
                        unmountOnExit
                      >
                        <Box
                          mt={1}
                          p={2}
                          bgcolor={theme === "light" ? "#f9f9f9" : "#111b21"}
                          borderRadius={2}
                          display="flex"
                          gap={2}
                          flexDirection={{ xs: "column", md: "row" }}
                        >
                          {item.details?.oldValue && (
                            <Box flex={1}>
                              <h4 style={{ marginBottom: "8px" }}>Old Value</h4>
                              <JsonView
                                value={item.details?.oldValue}
                                displayObjectSize={false}
                                displayDataTypes={false}
                                enableClipboard={false}
                                collapsed={false}
                                displayComma={false}
                                quotesOnKeys={false}
                                shortenTextAfterLength={25}
                                style={{
                                  ...(theme === "light"
                                    ? lightTheme
                                    : darkTheme),
                                  "--w-rjv-cursor-pointer": "default",
                                  "--w-rjv-line-color": "transparent",
                                  "--w-rjv-arrow-size": "0px",
                                }}
                              />
                            </Box>
                          )}

                          {item.details?.newValue && (
                            <Box flex={1}>
                              <h4 style={{ marginBottom: "8px" }}>New Value</h4>
                              <JsonView
                                value={item.details?.newValue}
                                displayObjectSize={false}
                                displayDataTypes={false}
                                enableClipboard={false}
                                collapsed={false}
                                displayComma={false}
                                quotesOnKeys={false}
                                shortenTextAfterLength={25}
                                style={{
                                  ...(theme === "light"
                                    ? lightTheme
                                    : darkTheme),
                                  "--w-rjv-cursor-pointer": "default",
                                  "--w-rjv-line-color": "transparent",
                                  "--w-rjv-arrow-size": "0px",
                                }}
                              />
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    )}
                  </div>

                  {hasDetails && (
                    <IconButton
                      onClick={() => toggleDetails(item._id)}
                      style={{ position: "absolute", top: 15, right: 20 }}
                    >
                      {expandedLogId === item._id ? (
                        <ExpandLessIcon />
                      ) : (
                        <ExpandMoreIcon />
                      )}
                    </IconButton>
                  )}
                </div>
              );
            }}
          />
        )}
      </Box>
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={props.open}
      onClose={props.toggleDrawer(false)}
      ModalProps={{ disablePortal: true }}
    >
      {drawerContent}
    </Drawer>
  );
}

export default React.memo(ActivityDrawer);
