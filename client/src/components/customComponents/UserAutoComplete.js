import React, { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import useUserList from "../../hooks/useUserList";

function UserAutoComplete(props) {
  const defaultUserList = useUserList();
  const userList = props.customUserList || defaultUserList;
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [inputValue, setInputValue] = useState(""); // track input
  const { formik } = props;

  const hasError = formik.touched.username && formik.errors.username;

  const searchUser = (event) => {
    const query = event.query.toLowerCase();
    const results = userList.filter((user) =>
      user.toLowerCase().includes(query)
    );
    setFilteredUsers(results);
    setInputValue(event.query); // set raw input text
  };

  const handleSelect = (e) => {
    formik.setFieldValue("username", e.value); // set formik value only on selection
    setInputValue(e.value); // reflect selected value
  };

  return (
    <div className="form-field-container">
      <AutoComplete
        value={inputValue}
        suggestions={filteredUsers}
        completeMethod={searchUser}
        onChange={(e) => setInputValue(e.value)} // update only local state
        onSelect={handleSelect}
        onBlur={() => formik.setFieldTouched("username", true)}
        placeholder={props.placeholder || "Select User"}
        className={`login-input ${hasError ? "p-invalid" : ""}`}
        dropdown
        {...props.inputProps}
        appendTo={"self"}
      />
      {hasError && <small className="p-error">{formik.errors.username}</small>}
    </div>
  );
}

export default React.memo(UserAutoComplete);
