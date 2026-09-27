import { createContext, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { getProfile } from "../services/authService";
import { hydrateCartForUser } from "../store/cartSlice";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          dispatch(hydrateCartForUser(null));
          setLoading(false);
          return;
        }

        const data = await getProfile(token);
        setUser(data.data);
        // BUG-028: swap to this user's own cart, not whatever was left
        // behind by the last logged-in account on this browser.
        dispatch(hydrateCartForUser(data.data._id));
      } catch (error) {
        console.log(error);
        localStorage.removeItem("token");
        dispatch(hydrateCartForUser(null));
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [dispatch]);

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    dispatch(hydrateCartForUser(null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
