import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const DashboardEditContext = createContext<{
  editMode: boolean;
  toggleEditMode: () => void;
  resetFn: (() => void) | null;
  registerReset: (fn: () => void) => void;
}>({
  editMode: false,
  toggleEditMode: () => {},
  resetFn: null,
  registerReset: () => {},
});

export function DashboardEditProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [resetFn, setResetFn] = useState<(() => void) | null>(null);

  const toggleEditMode = useCallback(() => setEditMode((e) => !e), []);
  const registerReset = useCallback(
    (fn: () => void) => setResetFn(() => fn),
    [],
  );

  return (
    <DashboardEditContext.Provider
      value={{ editMode, toggleEditMode, resetFn, registerReset }}
    >
      {children}
    </DashboardEditContext.Provider>
  );
}

export function useDashboardEdit() {
  return useContext(DashboardEditContext);
}
