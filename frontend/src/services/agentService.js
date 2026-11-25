import api from "../api/axios";

export const getMyAgentProfile = async () => {
  const response = await api.get("/agents/profile/me");
  return response.data;
};

export const updateAgentProfile = async (data) => {
  const response = await api.put("/agents/profile", data);
  return response.data;
};

export const getMyAgentStatus = async () => {
  const response = await api.get("/agents/status/me");
  return response.data;
};

export const setAgentOnlineStatus = async (online) => {
  const response = await api.patch("/agents/status", { online });
  return response.data;
};

export const updateAgentLocation = async ({ longitude, latitude, orderId }) => {
  const response = await api.patch("/agents/location", { longitude, latitude, orderId });
  return response.data;
};

export const getAgentDetails = async (agentId) => {
  const response = await api.get(`/agents/details/${agentId}`);
  return response.data;
};

export const getAllAgentsAdmin = async () => {
  const response = await api.get("/agents/all");
  return response.data;
};
