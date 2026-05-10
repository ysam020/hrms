import { createContext, useContext } from "react";

export interface TabValueContextValue {
  tabValue: number;
  setTabValue: React.Dispatch<React.SetStateAction<number>>;
}

export const TabValueContext = createContext<TabValueContextValue>({
  tabValue: 0,
  setTabValue: () => {},
});

export function useTabValue() {
  return useContext(TabValueContext);
}
