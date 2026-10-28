import { createContext } from "react";
import type { Dispatch, SetStateAction } from "react";

interface AlertState {
  open: boolean;
  message: string;
  severity: "error" | "info" | "success" | "warning";
}

interface AlertContextType {
  alert: AlertState;
  setAlert: Dispatch<SetStateAction<AlertState>>;
}

export const AlertContext = createContext<AlertContextType>(
  {} as AlertContextType,
);
