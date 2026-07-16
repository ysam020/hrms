import Box from "@mui/material/Box";
import type { Theme } from "@mui/material/styles";
import { NodeCard } from "./NodeCard";
import { RosterGrid } from "./RosterGrid";
import { LARGE_TEAM_THRESHOLD } from "./helpers";
import type { Employee } from "./types";

export const OrgTreeNode = ({
  employee,
  depth,
  theme,
  onSelect,
}: {
  employee: Employee;
  depth: number;
  theme: Theme;
  onSelect: (employee: Employee) => void;
}) => {
  const children = employee.children ?? [];
  // Large teams (e.g. 33-person Engineering) would blow the tree out
  // thousands of px wide if every member got its own connector line — fold
  // them into one bordered roster grid under a single trunk line instead.
  const useRoster = depth === 1 && children.length > LARGE_TEAM_THRESHOLD;

  return (
    <>
      <NodeCard
        employee={employee}
        depth={depth}
        theme={theme}
        onClick={() => onSelect(employee)}
      />
      {children.length > 0 && (
        <Box component="ul" sx={{ listStyle: "none" }}>
          {useRoster ? (
            <Box component="li" sx={{ listStyle: "none" }}>
              <RosterGrid
                members={children}
                theme={theme}
                onSelect={onSelect}
              />
            </Box>
          ) : (
            children.map((child) => (
              <Box
                component="li"
                key={child.username}
                sx={{ listStyle: "none" }}
              >
                <OrgTreeNode
                  employee={child}
                  depth={depth + 1}
                  theme={theme}
                  onSelect={onSelect}
                />
              </Box>
            ))
          )}
        </Box>
      )}
    </>
  );
};
