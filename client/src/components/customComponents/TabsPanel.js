// import * as React from "react";
// import Tabs from "@mui/material/Tabs";
// import Tab from "@mui/material/Tab";
// import Box from "@mui/material/Box";
// import useTabs from "../../hooks/useTabs";
// import ErrorFallback from "./ErrorFallback";
// import { ErrorBoundary } from "react-error-boundary";
// import { ThemeContext } from "../../contexts/ThemeContext";

// function TabsPanel({ tabData, tabKey }) {
//   const [value, setValue] = React.useState(
//     Number(localStorage.getItem(tabKey)) || 0
//   );
//   const { a11yProps } = useTabs();
//   const { theme } = React.useContext(ThemeContext);

//   const handleChange = (event, newValue) => {
//     setValue(newValue);
//     localStorage.setItem(tabKey, newValue);
//   };

//   return (
//     <Box sx={{ width: "100%", position: "relative" }}>
//       <Box
//         sx={{
//           borderBottom: 1,
//           borderColor: "divider",
//           position: "sticky",
//           top: 50,
//           zIndex: 1,
//           backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
//           elevation: 3,
//         }}
//       >
//         <Tabs
//           value={value}
//           onChange={handleChange}
//           aria-label="basic tabs example"
//         >
//           {tabData.map((tab, index) => (
//             <Tab key={index} label={tab.label} {...a11yProps(index)} />
//           ))}
//         </Tabs>
//       </Box>

//       <Box sx={{ p: 2 }}>
//         {tabData.map((tab, index) => (
//           <div
//             key={index}
//             style={{ display: value === index ? "block" : "none" }}
//           >
//             <React.Suspense fallback={<div>Loading...</div>}>
//               <ErrorBoundary fallback={<ErrorFallback />}>
//                 <tab.component />
//               </ErrorBoundary>
//             </React.Suspense>
//           </div>
//         ))}
//       </Box>
//     </Box>
//   );
// }

// export default React.memo(TabsPanel);

import * as React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import useTabs from "../../hooks/useTabs";
import ErrorFallback from "./ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";

function TabsPanel({ tabData, tabKey }) {
  const [value, setValue] = React.useState(
    Number(localStorage.getItem(tabKey)) || 0
  );
  const { a11yProps, CustomTabPanel } = useTabs();

  const handleChange = (event, newValue) => {
    setValue(newValue);
    localStorage.setItem(tabKey, newValue);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="basic tabs example"
        >
          {tabData.map((tab, index) => (
            <Tab key={index} label={tab.label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box>
        {tabData.map((tab, index) => (
          <CustomTabPanel value={value} index={index} key={index}>
            <React.Suspense fallback={<div>Loading...</div>}>
              <ErrorBoundary fallback={<ErrorFallback />}>
                {React.createElement(tab.component)}
              </ErrorBoundary>
            </React.Suspense>
          </CustomTabPanel>
        ))}
      </Box>
    </Box>
  );
}

export default React.memo(TabsPanel);
