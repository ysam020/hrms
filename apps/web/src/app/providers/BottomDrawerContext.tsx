import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const BottomDrawerContext = createContext<{
  isAnyOpen: boolean;
  setDrawerOpen: (isOpen: any) => void;
  dockVisible: boolean;
  setDockVisible: (v: boolean) => void;
}>({
  isAnyOpen: false,
  setDrawerOpen: () => {},
  dockVisible: false,
  setDockVisible: () => {},
});

export function BottomDrawerProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const [dockVisible, setDockVisible] = useState(false);

  const setDrawerOpen = useCallback((isOpen: boolean) => {
    setOpenCount((prev) => (isOpen ? prev + 1 : Math.max(0, prev - 1)));
  }, []);

  const value = React.useMemo(
    () => ({
      isAnyOpen: openCount > 0,
      setDrawerOpen,
      dockVisible,
      setDockVisible,
    }),
    [openCount, setDrawerOpen, dockVisible],
  );

  return (
    <BottomDrawerContext.Provider value={value}>
      {children}
    </BottomDrawerContext.Provider>
  );
}

export function useBottomDrawer() {
  return useContext(BottomDrawerContext);
}
