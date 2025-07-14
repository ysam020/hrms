import React, { useContext, useMemo } from "react";
import { UserContext } from "../../contexts/UserContext.js";
import "../../styles/modules.scss";
import { useNavigate } from "react-router-dom";
import routesConfig from "../../routes/routesConfig.js";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import useTabs from "../../hooks/useTabs.js";
import Grid from "@mui/material/Grid2";
import { TabValueContext } from "../../contexts/TabValueContext.js";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import GradeIcon from "@mui/icons-material/Grade";
import { Divider } from "primereact/divider";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { IconButton } from "@mui/material";
import apiClient from "../../config/axiosConfig.js";
import { AlertContext } from "../../contexts/AlertContext.js";
import { modules } from "../../assets/data/modules.js";

function Modules() {
  const { user, setUser } = useContext(UserContext);
  const { tabValue, setTabValue } = useContext(TabValueContext);
  const { setAlert } = useContext(AlertContext);
  const navigate = useNavigate();
  const { a11yProps } = useTabs();

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const routes = useMemo(() => routesConfig(), []);

  const categorizedModules = useMemo(() => {
    return modules.reduce((acc, mod) => {
      const route = routes.find((route) =>
        route.allowedModules.includes(mod.name)
      );
      const category = route ? route.category : "Uncategorized";

      if (!acc[category]) acc[category] = [];
      acc[category].push({
        name: mod.name,
        description: mod.description,
        path: route?.path,
      });

      return acc;
    }, {});
    // eslint-disable-next-line
  }, [modules, routes]);

  const sortedCategories = useMemo(
    () => (categorizedModules ? Object.keys(categorizedModules).sort() : []),
    [categorizedModules]
  );

  const handleFavModule = async (name, path) => {
    try {
      const res = await apiClient.post(`/add-favorite-module`, { name, path });
      setUser({ ...user, favoriteModules: res.data.favoriteModules });
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your changes will sync when back online."
            : error.response?.data?.message || "Something went wrong.",
        severity: "error",
      });
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tabValue}
          onChange={handleChange}
          aria-label="Module Categories"
        >
          {sortedCategories.map((category, idx) => (
            <Tab key={idx} label={category} {...a11yProps(idx)} />
          ))}
        </Tabs>
      </Box>

      {sortedCategories.map((category, idx) => (
        <Box sx={{ p: 2 }} key={idx}>
          <Grid container spacing={2} columnSpacing={3}>
            {categorizedModules[category]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(({ name, path, description }, id) => {
                const isFavorite = user?.favoriteModules?.some(
                  (mod) => mod.name === name
                );

                return (
                  <Grid
                    size={{ xs: 12, sm: 4, md: 3 }}
                    key={id}
                    className="module-col"
                  >
                    <div
                      className="module-col-inner"
                      style={{
                        backgroundImage: "url(/assets/images/m-bg.webp)",
                      }}
                    >
                      <h4>{name}</h4>
                      <p className="module-description">
                        {description || "No description available."}
                      </p>
                      <Divider />
                      <div>
                        <IconButton onClick={() => handleFavModule(name, path)}>
                          {isFavorite ? (
                            <GradeIcon style={{ color: "#FFD700" }} />
                          ) : (
                            <StarOutlineIcon />
                          )}
                        </IconButton>
                        <IconButton onClick={() => path && navigate(path)}>
                          <ChevronRightIcon />
                        </IconButton>
                      </div>
                    </div>
                  </Grid>
                );
              })}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}

export default React.memo(Modules);
