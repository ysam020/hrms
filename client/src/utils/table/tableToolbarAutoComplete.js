import { AutoComplete } from "primereact/autocomplete";

export const tableToolbarAutoComplete = (
  typedUser,
  setTypedUser,
  setSelectedUser,
  filteredUsers,
  searchUser
) => {
  return {
    renderTopToolbarCustomActions: () => (
      <AutoComplete
        value={typedUser}
        suggestions={filteredUsers}
        completeMethod={(e) => searchUser(e.query)}
        onChange={(e) => {
          setTypedUser(e.value);
        }}
        onSelect={(e) => {
          setTypedUser(e.value);
          setSelectedUser(e.value); // This triggers the API call
        }}
        placeholder="Select User"
        className="login-input table-autocomplete"
        dropdown
      />
    ),
  };
};
