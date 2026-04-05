import * as React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import ErrorFallback from "./ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { useNavigate, useLocation } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";

type TabsPanelProps = {
  tabData: any[];
  tabKey: string;
  basePath?: string;
};

const labelToSlug = (label: any) =>
  typeof label === "string"
    ? label
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    : null;

function CustomTabPanel({
  children,
  value,
  index,
  ...other
}: {
  children?: React.ReactNode;
  value: number;
  index: number;
  [key: string]: any;
}) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

function TabsPanel({ tabData, tabKey, basePath }: TabsPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const slugs = React.useMemo(
    () =>
      tabData.map((tab, i) => tab.slug || labelToSlug(tab.label) || String(i)),
    [tabData],
  );

  // Derive active tab index from URL when basePath is provided
  const urlValue = React.useMemo(() => {
    if (!basePath) return null;
    const baseDepth = basePath
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean).length;
    const pathSegments = location.pathname.split("/").filter(Boolean);
    if (pathSegments.length <= baseDepth) return 0;
    const slug = pathSegments[baseDepth];
    const index = slugs.indexOf(slug);
    return index >= 0 ? index : 0;
  }, [basePath, location.pathname, slugs]);

  const [localValue, setLocalValue] = React.useState(() =>
    basePath ? 0 : Number(localStorage.getItem(tabKey)) || 0,
  );

  const value = basePath !== undefined ? (urlValue ?? 0) : localValue;

  // Redirect to default tab if URL is at base or has unknown slug
  // Uses localStorage to restore last visited tab
  React.useEffect(() => {
    if (!basePath || slugs.length === 0) return;
    const baseDepth = basePath
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean).length;
    const pathSegments = location.pathname.split("/").filter(Boolean);
    if (
      pathSegments.length <= baseDepth ||
      !slugs.includes(pathSegments[baseDepth])
    ) {
      const savedSlug = localStorage.getItem(tabKey);
      const targetSlug =
        savedSlug && slugs.includes(savedSlug) ? savedSlug : slugs[0];
      navigate(`${basePath}/${targetSlug}`, { replace: true });
    }
  }, [basePath, location.pathname, navigate, slugs, tabKey]);

  const handleChange = (_event: any, newValue: any) => {
    if (basePath) {
      const slug = slugs[newValue];
      localStorage.setItem(tabKey, slug);
      navigate(`${basePath}/${slug}`);
    } else {
      setLocalValue(newValue);
      localStorage.setItem(tabKey, newValue);
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="basic tabs example"
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabData.map((tab, index) => (
            <Tab key={index} label={tab.label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box>
        {tabData.map((tab, index) => (
          <CustomTabPanel value={value} index={index} key={index}>
            <React.Suspense
              fallback={
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    p: 4,
                  }}
                >
                  <CircularProgress size={24} />
                </Box>
              }
            >
              <ErrorBoundary fallback={<ErrorFallback />}>
                {React.isValidElement(tab.component)
                  ? tab.component
                  : React.createElement(tab.component)}
              </ErrorBoundary>
            </React.Suspense>
          </CustomTabPanel>
        ))}
      </Box>
    </Box>
  );
}

export default React.memo(TabsPanel);
