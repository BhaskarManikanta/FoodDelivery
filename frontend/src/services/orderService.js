import api from "../api/axios";

export const createOrder = async (payload) => {
  const response = await api.post("/orders", payload);
  return response.data;
};

export const getMyOrders = async (page = 1, limit = 20) => {
  const response = await api.get(`/orders/my-orders?page=${page}&limit=${limit}`);
  return response.data;
};

export const getOrderById = async (id) => {
  const response = await api.get(`/orders/${id}`);
  return response.data;
};

export const cancelOrder = async (id) => {
  const response = await api.patch(`/orders/${id}/cancel`);
  return response.data;
};

export const getRestaurantOrders = async (status = "") => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await api.get(`/orders/restaurant/mine${query}`);
  return response.data;
};

export const restaurantDecision = async (id, { action, estimatedPrepTime, reason }) => {
  const response = await api.patch(`/orders/${id}/restaurant-decision`, {
    action,
    estimatedPrepTime,
    reason
  });
  return response.data;
};

export const restaurantUpdateStatus = async (id, status) => {
  const response = await api.patch(`/orders/${id}/restaurant-status`, { status });
  return response.data;
};

export const getAgentOrders = async () => {
  const response = await api.get("/orders/agent/mine");
  return response.data;
};

export const updateAgentOrderStatus = async (id, status) => {
  const response = await api.patch(`/orders/${id}/status`, { status });
  return response.data;
};

export const getAllOrdersAdmin = async (status = "") => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await api.get(`/orders/admin/all${query}`);
  return response.data;
};
