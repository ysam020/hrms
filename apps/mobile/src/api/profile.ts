import apiClient from "./client";

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  designation: string;
  department: string;
  employeeStatus: string;
  employee_photo: string;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantRole: string | null;
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await apiClient.get("/profile");
  return res.data.data.user;
}
