import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import PeopleIcon from "@mui/icons-material/People";
import { LEFT_FEATURES } from "./constants";

export function OrgSetupLeftPanel({ style }: { style: React.CSSProperties }) {
  return (
    <Grid size={6} className="login-left-col" style={style}>
      <div className="login-left-content">
        <div className="login-left-header">
          <div className="company-badge">
            <PeopleIcon sx={{ fontSize: 20, mr: 1 }} />
            <Typography
              variant="body2"
              className="main-heading"
              sx={{ fontWeight: 600 }}
            >
              HR Management System
            </Typography>
          </div>

          <Typography variant="h3" className="main-heading">
            Your Workspace,
            <br />
            <span className="gradient-text">Your Way</span>
          </Typography>

          <Typography variant="body1" className="sub-heading">
            Set up your organisation in minutes and unlock a complete suite of
            HR tools built for modern teams.
          </Typography>
        </div>

        <div className="features-grid">
          {LEFT_FEATURES.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon" style={{ color: f.color }}>
                {f.icon}
              </div>
              <div className="feature-content">
                <Typography variant="subtitle2" className="feature-title">
                  {f.title}
                </Typography>
                <Typography variant="caption" className="feature-description">
                  {f.description}
                </Typography>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Grid>
  );
}
