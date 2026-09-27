import api from "../api/axios";

export const createOrder = async (payload) => {
  const response = await api.post("/orders", payload);
  return response.data;
};

export const getMyOrders = async () => {
  const response = await api.get("/orders/my-orders");
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
