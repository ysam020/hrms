import React, { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";

function UserAutoComplete(props: {
  formik: any;
  userList?: string[];
  customUserList?: string[];
  placeholder?: string;
  inputProps?: any;
  fieldName?: string;
  [key: string]: any;
}) {
  const userList: string[] = props.userList || props.customUserList || [];
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const { formik, fieldName = "username" } = props;

  const hasError = formik.touched[fieldName] && formik.errors[fieldName];

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
        onBlur={() => formik.setFieldTouched(fieldName, true)}
        placeholder={props.placeholder || "Select User"}
        className={`login-input ${hasError ? "p-invalid" : ""}`}
        dropdown
        {...props.inputProps}
        appendTo={"self"}
      />
      {hasError && (
        <small className="p-error">{formik.errors[fieldName]}</small>
      )}
    </div>
  );
}

export default React.memo(UserAutoComplete);
