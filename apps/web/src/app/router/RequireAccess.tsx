import { Suspense, lazy, useContext, type ReactNode } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { UserContext } from "@web/app/providers/UserContext";

const UnAuthorisedRoute = lazy(() => import("./UnAuthorisedRoute"));

/**
 * Route-level permission gate. Wraps a route's element in routesConfig.tsx
 * so every path under a gated module — including legacy/deep-link/detail
 * sibling routes that don't go through the module's own tab component — is
 * covered by one check, instead of each page remembering to gate itself.
 */
function RequireAccess({
  check,
  children,
}: {
  check: (user: any) => boolean;
  children: ReactNode;
}) {
  const { user } = useContext(UserContext);

  if (!check(user)) {
    return (
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        }
      >
        <UnAuthorisedRoute />
      </Suspense>
    );
  }

  return <>{children}</>;
}

export default RequireAccess;
