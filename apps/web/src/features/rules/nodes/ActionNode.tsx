import { Handle, Position } from "reactflow";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ActionIcon from "@mui/icons-material/FlashOn";

const ActionNode = ({ data, selected }) => {
  return (
    <Paper
      elevation={selected ? 6 : 3}
      sx={{
        p: 1,
        minWidth: 200,
        bgcolor: "warning.light",
        color: "white",
        borderRadius: 2,
        border: selected ? "2px solid" : "none",
        borderColor: "warning.dark",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#ff9800",
          width: 12,
          height: 12,
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <ActionIcon fontSize="small" />
        <Typography variant="body2">Action</Typography>
      </Box>

      {data.action && (
        <Box sx={{ mt: 1 }}>
          <Chip
            label={data.action.type}
            size="small"
            sx={{ bgcolor: "white", color: "warning.main", mb: 0.5 }}
          />
          {data.action.message && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                bgcolor: "rgba(255,255,255,0.2)",
                p: 0.5,
                borderRadius: 1,
                fontSize: "0.7rem",
              }}
            >
              {data.action.message}
            </Typography>
          )}
        </Box>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#ff9800",
          width: 12,
          height: 12,
        }}
      />
    </Paper>
  );
};

export default ActionNode;
