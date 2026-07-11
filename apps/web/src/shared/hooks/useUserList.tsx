import { useMemo } from "react";
import useFetchData from "./useFetchData";

function useUserList() {
  // /get-all-users is paginated (default page size 50 — see
  // PAGINATION.DEFAULT_LIMIT_LARGE in the gateway) but this hook feeds
  // search/autocomplete dropdowns that need the whole tenant's user list to
  // filter against, not just page 1. Without an explicit limit, any user
  // sorted past position 50 (alphabetically by first name) was silently
  // unfetched and so unselectable everywhere this hook is used, no matter
  // what was typed. 200 is the endpoint's hard cap (MAX_LIMIT_LARGE).
  const { data: usersData } = useFetchData(
    "/get-all-users?limit=200",
    "get",
    [],
    null,
    null,
  );

  const userList = useMemo(() => {
    if (!usersData || !Array.isArray(usersData)) return [];
    return usersData.map((user) => ({ value: user.id, label: user.username }));
  }, [usersData]);

  return userList;
}

export default useUserList;
