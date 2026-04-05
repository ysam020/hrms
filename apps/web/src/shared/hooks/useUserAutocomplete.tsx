import { useState, useMemo, useCallback, useEffect } from "react";
import debounce from "lodash/debounce";
import { tableToolbarAutoComplete } from "@web/shared/utils/table/tableToolbarAutoComplete";

const useUserAutoComplete = (userList) => {
  const [typedUser, setTypedUser] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);

  const handleSearch = useCallback(
    (query) => {
      const lowerQuery = query.toLowerCase();
      const results = userList.filter((user) =>
        user.toLowerCase().includes(lowerQuery),
      );
      setFilteredUsers(results);
    },
    [userList],
  );

  const debouncedSearchUser = useMemo(
    () => debounce(handleSearch, 300),
    [handleSearch],
  );

  useEffect(() => {
    return () => {
      debouncedSearchUser.cancel(); // cleanup
    };
  }, [debouncedSearchUser]);

  const toolbarActions = useMemo(
    () =>
      tableToolbarAutoComplete(
        typedUser,
        setTypedUser,
        setSelectedUser,
        filteredUsers,
        debouncedSearchUser,
      ),

    [typedUser, selectedUser, filteredUsers, debouncedSearchUser],
  );

  return {
    selectedUser,
    setSelectedUser,
    typedUser,
    setTypedUser,
    filteredUsers,
    setFilteredUsers,
    toolbarActions,
  };
};

export default useUserAutoComplete;
