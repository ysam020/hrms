import React, { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import apiClient from "@web/core/http/axiosConfig";

function UserAutoComplete(props: {
  formik: any;
  userList?: string[];
  customUserList?: string[];
  placeholder?: string;
  inputProps?: any;
  fieldName?: string;
  [key: string]: any;
}) {
  const localList: string[] = props.userList || props.customUserList || [];
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const { formik, fieldName = "username" } = props;

  const hasError = formik.touched[fieldName] && formik.errors[fieldName];

  const searchUser = async (event: any) => {
    const query = event.query;

    if (localList.length > 0) {
      // Client-side filter when a pre-fetched list is provided
      const q = query.toLowerCase();
      setFilteredUsers(
        localList.filter((user) => user && user.toLowerCase().includes(q)),
      );
    } else {
      // Server-side search — no pagination issue regardless of user count
      try {
        const res = await apiClient.get(
          `/get-all-users?search=${encodeURIComponent(query)}&limit=50`,
        );
        const users: any[] = res.data?.data ?? res.data ?? [];
        setFilteredUsers(users.map((u) => u.username).filter(Boolean));
      } catch {
        setFilteredUsers([]);
      }
    }
  };

  return (
    <div className="form-field-container">
      <AutoComplete
        value={formik.values[fieldName]}
        suggestions={filteredUsers}
        completeMethod={searchUser}
        onChange={(e) => formik.setFieldValue(fieldName, e.value)}
        onSelect={(e) => formik.setFieldValue(fieldName, e.value)}
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
