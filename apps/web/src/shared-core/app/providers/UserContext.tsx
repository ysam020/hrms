import { createContext } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UserContextType {
  user: any;
  setUser: Dispatch<SetStateAction<any>>;
  handleLogout: () => void;
}

export const UserContext = createContext<UserContextType>(
  {} as UserContextType,
);
