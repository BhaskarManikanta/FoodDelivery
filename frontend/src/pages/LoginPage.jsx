import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";

import { loginUser } from "../services/authService";

import { AuthContext } from "../context/AuthContext";
import { hydrateCartForUser } from "../store/cartSlice";

function LoginPage() {

  const navigate = useNavigate();

  const { setUser } = useContext(AuthContext);
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {

    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });

  };

  const handleSubmit = async (e) => {

    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {

      const data = await loginUser(formData);

      localStorage.setItem(
        "token",
        data.data.token
      );

      setUser(data.data.user);
      dispatch(hydrateCartForUser(data.data.user._id));

      navigate("/profile");

    } catch (error) {

      console.log(error);
      // BUG-025-adjacent: show what actually happened instead of a flat
      // "Login failed" alert for every possible cause.
      setError(error.response?.data?.message || "Login failed. Check your email and password.");

    } finally {

      setSubmitting(false);

    }

  };

  return (
    <div className="flex justify-center items-center min-h-screen">

      <form
        onSubmit={handleSubmit}
        className="w-[350px] shadow p-5 rounded"
      >

        <h1 className="text-2xl font-bold mb-5">
          Login
        </h1>

        <input
          type="email"
          name="email"
          placeholder="Email"
          className="border p-2 w-full mb-4"
          onChange={handleChange}
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          className="border p-2 w-full mb-4"
          onChange={handleChange}
        />

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <button
          className="bg-black text-white px-4 py-2 w-full disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? "Logging in..." : "Login"}
        </button>

      </form>

    </div>
  );
}

export default LoginPage;
