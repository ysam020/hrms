import { Handle, Position } from "reactflow";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import EndIcon from "@mui/icons-material/CheckCircle";

const EndNode = ({ data }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        p: 1,
        minWidth: 150,
        bgcolor: "error.light",
        color: "white",
        borderRadius: 2,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#f44336",
          width: 12,
          height: 12,
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          justifyContent: "center",
        }}
      >
        <EndIcon />
        <Typography variant="body2">{data.label || "End"}</Typography>
      </Box>
    </Paper>
  );
};

export default EndNode;
