import { createContext } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UserContextType {
  user: any;
  setUser: Dispatch<SetStateAction<any>>;
  handleLogout: () => void;
  /**
   * The person signed out themselves (rather than the session expiring).
   * Sign-in then starts fresh instead of returning to the page they left —
   * on a shared device that page belongs to someone else's session.
   */
  endedByUser?: boolean;
}

export const UserContext = createContext<UserContextType>(
  {} as UserContextType,
);
