import { Handle, Position } from "reactflow";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import StartIcon from "@mui/icons-material/PlayArrow";

const StartNode = ({ data }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        p: 1,
        minWidth: 150,
        bgcolor: "success.light",
        color: "white",
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          justifyContent: "center",
        }}
      >
        <StartIcon />
        <Typography variant="body2">{data.label || "Start"}</Typography>
      </Box>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#4caf50",
          width: 12,
          height: 12,
        }}
      />
    </Paper>
  );
};

export default StartNode;
