import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@web/shared/components/Button";
import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import Close from "@mui/icons-material/Close";
import { getRoleConfig } from "./helpers";
import type { Employee } from "./types";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";

export function EmployeeDetailDialog({
  employee,
  isMobile,
  theme,
  onClose,
}: {
  employee: Employee | null;
  isMobile: boolean;
  theme: Theme;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!employee}
      onClose={ignoreBackdropClick(onClose)}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      PaperProps={{
        sx: { borderRadius: { xs: 0, sm: 2 }, m: { xs: 0, sm: 2 } },
      }}
    >
      {employee && (
        <>
          <DialogTitle
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              color: theme.palette.primary.contrastText,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: { xs: 1.5, sm: 2 },
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, fontSize: { xs: "1rem", sm: "1rem" } }}
            >
              {employee.first_name} {employee.last_name}
            </Typography>
            <IconButton
              onClick={onClose}
              aria-label="Close employee details"
              sx={{ color: theme.palette.primary.contrastText, p: 0.5 }}
              size="small"
            >
              <Close
                aria-hidden="true"
                sx={{ fontSize: { xs: "1.3rem", sm: "1.2rem" } }}
              />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
              <Grid item xs={12}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mb: { xs: 1.25, sm: 1.5 },
                  }}
                >
                  <Avatar
                    src={employee.employee_photo || undefined}
                    sx={{
                      width: { xs: 48, sm: 40 },
                      height: { xs: 48, sm: 40 },
                      mr: { xs: 1.25, sm: 1.5 },
                      backgroundColor: getRoleConfig(
                        employee.designation,
                        theme,
                      ).color,
                      fontSize: { xs: "1.1rem", sm: "1rem" },
                      fontWeight: 600,
                    }}
                  >
                    {employee.first_name?.[0]}
                    {employee.last_name?.[0]}
                  </Avatar>
                  <Box>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 600,
                        fontSize: { xs: "1rem", sm: "1rem" },
                      }}
                    >
                      {employee.first_name} {employee.last_name}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: { xs: "0.85rem", sm: "0.875rem" } }}
                    >
                      {employee.designation}
                    </Typography>
                  </Box>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Box
                  sx={{
                    p: { xs: 1.25, sm: 1.5 },
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderRadius: 1,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                  }}
                >
                  <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
                    <Grid item xs={6}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: { xs: "0.75rem", sm: "0.75rem" } }}
                      >
                        Department
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          fontSize: { xs: "0.85rem", sm: "0.875rem" },
                        }}
                      >
                        {employee.department || "—"}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: { xs: "0.75rem", sm: "0.75rem" } }}
                      >
                        Status
                      </Typography>
                      <Chip
                        label={employee.employeeStatus}
                        size="small"
                        color="success"
                        sx={{
                          fontWeight: 500,
                          height: { xs: 22, sm: 20 },
                          fontSize: { xs: "0.7rem", sm: "0.7rem" },
                        }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            </Grid>
          </DialogContent>

          <DialogActions sx={{ p: { xs: 1.5, sm: 2 }, pt: 0 }}>
            <Button
              variant="ghost"
              onClick={onClose}
              size="small"
              style={{
                color: theme.palette.text.secondary,
                fontSize: "0.875rem",
              }}
            >
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
