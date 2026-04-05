import React, { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";

function UserAutoComplete(props: {
  formik: any;
  userList?: string[];
  customUserList?: string[];
  placeholder?: string;
  inputProps?: any;
  [key: string]: any;
}) {
  const userList: string[] = props.userList || props.customUserList || [];
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const { formik } = props;

  const hasError = formik.touched.username && formik.errors.username;

  const searchUser = (event: any) => {
    const query = event.query.toLowerCase();
    const results = userList.filter((user) =>
      user.toLowerCase().includes(query),
    );
    setFilteredUsers(results);
    setInputValue(event.query);
  };

  const handleSelect = (e: any) => {
    formik.setFieldValue("username", e.value);
    setInputValue(e.value);
  };

  return (
    <div className="form-field-container">
      <AutoComplete
        value={inputValue}
        suggestions={filteredUsers}
        completeMethod={searchUser}
        onChange={(e) => setInputValue(e.value)}
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
