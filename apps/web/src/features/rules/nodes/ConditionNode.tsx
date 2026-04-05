import { Handle, Position } from "reactflow";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ConditionIcon from "@mui/icons-material/AccountTree";

const ConditionNode = ({ data, selected }) => {
  return (
    <Paper
      elevation={selected ? 6 : 3}
      sx={{
        p: 1,
        minWidth: 200,
        bgcolor: "info.light",
        color: "white",
        borderRadius: 2,
        border: selected ? "2px solid" : "none",
        borderColor: "info.dark",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#2196f3",
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
        <ConditionIcon fontSize="small" />
        <Typography variant="body2">Condition</Typography>
      </Box>

      {data.condition && (
        <Box sx={{ mt: 1 }}>
          <Chip
            label={`${data.condition.field} ${data.condition.operator} ${data.condition.value}`}
            size="small"
            sx={{ bgcolor: "white", color: "info.main" }}
          />
        </Box>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{
          background: "#4caf50",
          width: 12,
          height: 12,
          left: "30%",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{
          background: "#f44336",
          width: 12,
          height: 12,
          left: "70%",
        }}
      />
    </Paper>
  );
};

export default ConditionNode;
