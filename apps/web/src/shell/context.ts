import { createContext, useContext, type ReactNode } from "react";

export interface ShellContextValue {
  /** Regular width (≥1024): sidebar is docked and can be hidden. */
  docked: boolean;
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  /** Medium/compact: open the navigation sheet. */
  openNavigation: () => void;
  /** Global trailing toolbar items (search, notifications) rendered by Page. */
  toolbarExtras: ReactNode;
}

export const ShellContext = createContext<ShellContextValue>({
  docked: true,
  sidebarHidden: false,
  toggleSidebar: () => {},
  openNavigation: () => {},
  toolbarExtras: null,
});

export const useShell = () => useContext(ShellContext);
