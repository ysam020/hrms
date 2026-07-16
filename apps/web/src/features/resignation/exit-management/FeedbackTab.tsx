import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Rating from "@mui/material/Rating";

function FeedbackRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const display = value || "Not provided";
  return (
    <>
      <Box sx={{ py: 1.25 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: "text.secondary",
              minWidth: "160px",
              flexShrink: 0,
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              textAlign: "right",
              color: value ? "text.primary" : "text.disabled",
              fontStyle: value ? "normal" : "italic",
              lineHeight: 1.4,
            }}
          >
            {display}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ opacity: 0.6 }} />
    </>
  );
}

export function FeedbackTab({
  overallJobSatisfaction,
  reason,
  qualityOfCommunication,
  supportFromManager,
  appreciationForWork,
  collaborationWithinTheTeam,
  overallCompanyCulture,
  suggestions,
}: {
  overallJobSatisfaction?: number;
  reason?: string;
  qualityOfCommunication?: string;
  supportFromManager?: string;
  appreciationForWork?: string;
  collaborationWithinTheTeam?: string;
  overallCompanyCulture?: string;
  suggestions?: string;
}) {
  return (
    <Box>
      <Box sx={{ py: 1.5, textAlign: "center" }}>
        <Typography
          variant="subtitle2"
          fontWeight={600}
          color="text.secondary"
          gutterBottom
        >
          Overall Job Satisfaction
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
          }}
        >
          <Rating value={overallJobSatisfaction || 0} readOnly />
          <Typography variant="h6" fontWeight={600} color="primary.main">
            {overallJobSatisfaction || 0}/5
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ my: 1 }} />
      <FeedbackRow label="Exit Reason" value={reason} />
      <FeedbackRow
        label="Quality of Communication"
        value={qualityOfCommunication}
      />
      <FeedbackRow label="Manager Support" value={supportFromManager} />
      <FeedbackRow label="Work Appreciation" value={appreciationForWork} />
      <FeedbackRow
        label="Team Collaboration"
        value={collaborationWithinTheTeam}
      />
      <FeedbackRow label="Company Culture" value={overallCompanyCulture} />
      <Box sx={{ py: 1.25 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 500, color: "text.secondary", mb: 0.5 }}
        >
          Suggestions
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: suggestions ? "text.primary" : "text.disabled",
            fontStyle: suggestions ? "normal" : "italic",
          }}
        >
          {suggestions || "Not provided"}
        </Typography>
      </Box>
    </Box>
  );
}
