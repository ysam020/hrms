import "../../styles/keyboard-shortcuts.scss";
import React, { useState, useEffect, useMemo } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid2";

function Help() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsMac(userAgent.includes("mac"));
  }, []);

  // Memoize keyboard shortcuts
  const keyboardShortcuts = useMemo(
    () => [
      {
        title: "Toggle Fullscreen",
        keys: [isMac ? "Cmd" : "Ctrl", "Shift", "F"],
      },
      {
        title: "Show/Hide Sidebar",
        keys: [isMac ? "Cmd" : "Ctrl", "Shift", "S"],
      },
      {
        title: "Route Query",
        keys: ["Shift", "Space"],
      },
      {
        title: "Navigate Between Pages",
        keys: [isMac ? "Cmd" : "Ctrl", "Shift", "← →"],
      },
      {
        title: "Logout",
        keys: [isMac ? "Cmd" : "Ctrl", "Shift", "L"],
      },
    ],
    [isMac] // Recalculate only when `isMac` changes
  );

  // Memoize shortcut key rendering function
  const getShortcutKeys = useMemo(
    () => (keys) =>
      keys.map((key, index) => (
        <span key={index} className="key">
          {key}
        </span>
      )),
    []
  );

  return (
    <Grid container>
      <Grid size={12}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <List sx={{ width: "100%", bgcolor: "background.paper" }}>
            {keyboardShortcuts.map((shortcut, index) => (
              <React.Fragment key={index}>
                <ListItem alignItems="flex-start">
                  <ListItemText primary={shortcut.title} />
                  <ListItemText
                    secondary={
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                        }}
                      >
                        {getShortcutKeys(shortcut.keys)}
                      </span>
                    }
                  />
                </ListItem>
                {index < keyboardShortcuts.length - 1 && (
                  <Divider variant="inset" component="li" />
                )}
              </React.Fragment>
            ))}
          </List>
        </div>
      </Grid>
    </Grid>
  );
}

export default React.memo(Help);
