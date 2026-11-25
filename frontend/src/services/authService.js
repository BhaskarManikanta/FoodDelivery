import api from "../api/axios";

export const registerUser = async (formData) => {

  const response = await api.post(
    "/users/register",
    formData
  );

  return response.data;
};

export const loginUser = async (formData) => {

  const response = await api.post(
    "/users/login",
    formData
  );

  return response.data;
};

export const getProfile = async (token) => {
  const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  const response = await api.get("/users/profile", config);
  return response.data;
};

export const updateProfile = async (data) => {
  const response = await api.put("/users/profile", data);
  return response.data;
};

export const getAllUsers = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `/users?${query}` : "/users";
  const response = await api.get(url);
  return response.data;
};

export const getUserStats = async () => {
  const response = await api.get("/users/stats");
  return response.data;
};

export const updateUserRole = async (userId, role) => {
  const response = await api.patch(`/users/${userId}/role`, { role });
  return response.data;
};