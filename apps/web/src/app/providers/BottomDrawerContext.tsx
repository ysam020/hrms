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
}>({ isAnyOpen: false, setDrawerOpen: () => {} });

export function BottomDrawerProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0);

  const setDrawerOpen = useCallback((isOpen: boolean) => {
    setOpenCount((prev) => (isOpen ? prev + 1 : Math.max(0, prev - 1)));
  }, []);

  const value = React.useMemo(
    () => ({ isAnyOpen: openCount > 0, setDrawerOpen }),
    [openCount, setDrawerOpen],
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
