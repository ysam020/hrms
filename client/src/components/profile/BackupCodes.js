import React, { useContext, useMemo } from "react";
import { UserContext } from "../../contexts/UserContext";
import { AlertContext } from "../../contexts/AlertContext";
import { Tooltip, IconButton, Divider } from "@mui/material";
import Grid from "@mui/material/Grid2";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import DeleteIcon from "@mui/icons-material/Delete";
import MailIcon from "@mui/icons-material/Mail";
import "../../styles/backup-codes.scss";

function BackupCodes() {
  const { user, setUser } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);

  // Memoize the backup codes to prevent unnecessary recomputation
  const codePairs = useMemo(() => {
    return user.backupCodes?.reduce((acc, curr, idx) => {
      if (idx % 2 === 0) acc.push([curr]);
      else acc[acc.length - 1].push(curr);
      return acc;
    }, []);
  }, [user.backupCodes]);

  const handleAction = async (action, ...args) => {
    try {
      switch (action) {
        case "requestNewCodes": {
          const { requestNewCodes } = await import(
            "../../utils/profile/requestNewCodes"
          );
          requestNewCodes(...args);
          break;
        }
        case "deleteCodes": {
          const { deleteCodes } = await import(
            "../../utils/profile/deleteCodes"
          );
          deleteCodes(...args);
          break;
        }
        case "sendEmail": {
          const { sendEmail } = await import(
            "../../utils/profile/sendBackupCodeEmail"
          );
          sendEmail(...args);
          break;
        }
        default:
          throw new Error("Invalid action type");
      }
    } catch (error) {
      console.error("Failed to perform action:", error);
    }
  };

  function ActionButton({ title, icon: Icon, onClick }) {
    return (
      <Tooltip title={title}>
        <IconButton onClick={onClick}>
          <Icon />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <div className="backup-codes profile-container">
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <h5>Your Backup Codes</h5>
          <p>{user.backupCodes?.length} backup codes remaining</p>
        </div>
        <div className="backup-codes-actions">
          <ActionButton
            title="Request new backup codes"
            icon={ReplayRoundedIcon}
            onClick={() => handleAction("requestNewCodes", user, setUser)}
          />
          <ActionButton
            title="Delete backup codes"
            icon={DeleteIcon}
            onClick={() => handleAction("deleteCodes", user, setUser, setAlert)}
          />
          <ActionButton
            title="Email backup codes"
            icon={MailIcon}
            onClick={() => handleAction("sendEmail", setAlert)}
          />
        </div>
      </div>

      <Divider variant="fullWidth" sx={{ opacity: 1, margin: "20px 0" }} />

      {codePairs?.map((pair, index) => (
        <Grid container key={index} className="backup-codes-row">
          {pair.map((code, colIndex) => (
            <Grid size={6} key={colIndex}>
              <p>{code}</p>
            </Grid>
          ))}
        </Grid>
      ))}
    </div>
  );
}

export default React.memo(BackupCodes);
