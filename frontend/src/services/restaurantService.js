import api from "../api/axios";

export const getRestaurants = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const url = query ? `/restaurants?${query}` : "/restaurants";
  const response = await api.get(url);
  return response.data;
};

export const getRestaurantById = async (id) => {
  const response = await api.get(`/restaurants/${id}`);
  return response.data;
};

export const searchRestaurants = async (query) => {
  const response = await api.get(`/restaurants/search?q=${encodeURIComponent(query)}`);
  return response.data;
};

export const getMyRestaurants = async (all = false) => {
  const url = all ? "/restaurants/mine?all=true" : "/restaurants/mine";
  const response = await api.get(url);
  return response.data;
};

export const createRestaurant = async (data) => {
  const response = await api.post("/restaurants", data);
  return response.data;
};

export const updateRestaurant = async (id, data) => {
  const response = await api.patch(`/restaurants/${id}`, data);
  return response.data;
};

export const deleteRestaurant = async (id) => {
  const response = await api.delete(`/restaurants/${id}`);
  return response.data;
};

export const addMenuItem = async (restaurantId, item) => {
  const response = await api.post(`/restaurants/${restaurantId}/menu`, item);
  return response.data;
};

export const updateMenuItem = async (restaurantId, itemId, item) => {
  const response = await api.patch(`/restaurants/${restaurantId}/menu/${itemId}`, item);
  return response.data;
};

export const deleteMenuItem = async (restaurantId, itemId) => {
  const response = await api.delete(`/restaurants/${restaurantId}/menu/${itemId}`);
  return response.data;
};