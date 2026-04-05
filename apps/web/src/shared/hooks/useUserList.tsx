import { useMemo } from "react";
import useFetchData from "./useFetchData";

function useUserList() {
  // Fetch all users using the custom hook
  const { data: usersData } = useFetchData(
    "/get-all-users",
    "get",
    [],
    null,
    null,
  );

  // Transform the data to extract usernames
  const userList = useMemo(() => {
    if (!usersData || !Array.isArray(usersData)) return [];
    return usersData.map((user) => user.username);
  }, [usersData]);

  return userList;
}

export default useUserList;
