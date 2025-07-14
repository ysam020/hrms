import { useState, useEffect } from "react";
import apiClient from "../config/axiosConfig";

function useUserList() {
  const [userList, setUserList] = useState([]);

  useEffect(() => {
    async function getUsers() {
      try {
        const response = await apiClient.get("/get-all-users");
        setUserList(response.data.map((user) => user.username));
      } catch (error) {
        console.error("Error fetching user list:", error);
      }
    }

    getUsers();
  }, []);
  return userList;
}

export default useUserList;
