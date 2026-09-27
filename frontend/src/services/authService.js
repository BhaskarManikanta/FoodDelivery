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

  const response = await api.get(
    "/users/profile",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
};