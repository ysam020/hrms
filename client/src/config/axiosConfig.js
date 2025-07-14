import axios from "axios";

// Create an instance with defaults
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_STRING,
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

export default apiClient;
