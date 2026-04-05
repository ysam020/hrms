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
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import useUserList from "@web/shared/hooks/useUserList";
import useFetchData from "@web/shared/hooks/useFetchData";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import JsonView from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";
import { darkTheme } from "@uiw/react-json-view/dark";
import { timePresets } from "@web/assets/data/timePresets";
import { entityOptions } from "@web/assets/data/entityOptions";
import { getDeviceInfo } from "@web/shared/utils/getDeviceInfo";

function AuditLogs(props) {
  const [selectedDays, setSelectedDays] = React.useState(1);
  const [selectedEntity, setSelectedEntity] = React.useState<string | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = React.useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);

  const userList = useUserList();
  const { theme } = React.useContext(ThemeContext);

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    params.append("days", String(selectedDays));

    if (typeof selectedEntity === "string" && selectedEntity.trim()) {
      params.append("entityType", selectedEntity);
    }

    if (typeof selectedUser === "string" && selectedUser.trim()) {
      params.append("userName", selectedUser);
    }

    return params.toString();
  }, [selectedDays, selectedEntity, selectedUser]);

  // Fetch audit logs - only fetch when drawer is open
  const { data: filteredLogs, loading } = useFetchData(
    props.open ? `/audit-logs?${queryParams}` : null,
    "get",
    [props.open, queryParams],
    null,
    "Error loading audit logs",
  );

  const toggleDetails = (logId) => {
    setExpandedLogId((prevId) => (prevId === logId ? null : logId));
  };

  const clearAllFilters = () => {
    setSelectedDays(1);
    setSelectedUser(null);
    setSelectedEntity(null);
  };

  // Use empty array as fallback if data is not available
  const logs = filteredLogs || [];

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
            <TextField
              select
              label="Select Time Range"
              size="small"
              value={selectedDays}
              onChange={(e) => setSelectedDays(Number(e.target.value))}
              sx={{ minWidth: 180, mr: 1 }}
            >
              {timePresets.map((option, index) => (
                <MenuItem key={index} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Filter by User"
              size="small"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              sx={{ minWidth: 180, mr: 1 }}
            >
              {userList.map((option, index) => (
                <MenuItem key={index} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Filter by Entity"
              size="small"
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              sx={{ minWidth: 180, mr: 1 }}
            >
              {entityOptions.map((option, index) => (
                <MenuItem key={index} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
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
        ) : logs.length === 0 ? (
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
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {logs.map((item, index) => {
              const hasDetails =
                !!item.details?.oldValue || !!item.details?.newValue;

              const deviceInfo = getDeviceInfo(item);

              return (
                <div
                  key={item._id || index}
                  className="activity-log flex-div"
                  style={{ position: "relative", paddingBottom: "10px" }}
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
                                shortenTextAfterLength={25}
                                style={
                                  {
                                    ...(theme === "light"
                                      ? lightTheme
                                      : darkTheme),
                                    "--w-rjv-cursor-pointer": "default",
                                    "--w-rjv-line-color": "transparent",
                                    "--w-rjv-arrow-size": "0px",
                                  } as React.CSSProperties
                                }
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
                                shortenTextAfterLength={25}
                                style={
                                  {
                                    ...(theme === "light"
                                      ? lightTheme
                                      : darkTheme),
                                    "--w-rjv-cursor-pointer": "default",
                                    "--w-rjv-line-color": "transparent",
                                    "--w-rjv-arrow-size": "0px",
                                  } as React.CSSProperties
                                }
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
            })}
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Drawer
      anchor="right"
      open={props.open}
      onClose={props.toggleDrawer(false)}
      disablePortal={true}
      ModalProps={{ disablePortal: true }}
    >
      {drawerContent}
    </Drawer>
  );
}

export default React.memo(AuditLogs);
