import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
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

  const handleLoginSuccess = (userData, token) => {
    localStorage.setItem("token", token);
    setUser(userData);
    dispatch(hydrateCartForUser(userData._id));

    if (userData.role === "restaurant") {
      navigate("/restaurant/dashboard");
    } else if (userData.role === "agent") {
      navigate("/agent/dashboard");
    } else if (userData.role === "admin") {
      navigate("/admin/dashboard");
    } else {
      navigate("/");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await loginUser(formData);
      handleLoginSuccess(data.data.user, data.data.token);
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.message || "Login failed. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = async (email, password) => {
    setFormData({ email, password });
    setError("");
    setSubmitting(true);
    try {
      const data = await loginUser({ email, password });
      handleLoginSuccess(data.data.user, data.data.token);
    } catch (err) {
      setError(err.response?.data?.message || "Quick login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-64px)] bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-orange-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-3 shadow-md shadow-orange-200">
            ⚡
          </div>
          <h1 className="text-2xl font-black text-gray-900">Welcome Back</h1>
          <p className="text-xs text-gray-500 mt-1">Sign in to your QuickBite food delivery account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              placeholder="e.g. customer@example.com"
              className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
              onChange={handleChange}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl shadow-md shadow-orange-200 transition disabled:opacity-50 text-sm"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="font-bold text-orange-600 hover:underline">
            Register here
          </Link>
        </p>

        {/* Demo Fast Login Buttons */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block text-center mb-3">
            Quick 1-Click Demo Logins
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => quickLogin("customer@example.com", "password123")}
              className="p-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-xl font-bold transition text-left"
            >
              👤 Customer
              <span className="block text-[10px] text-blue-600 font-normal">customer@example.com</span>
            </button>
            <button
              type="button"
              onClick={() => quickLogin("restaurant@example.com", "password123")}
              className="p-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl font-bold transition text-left"
            >
              🍳 Restaurant
              <span className="block text-[10px] text-amber-600 font-normal">restaurant@example.com</span>
            </button>
            <button
              type="button"
              onClick={() => quickLogin("agent@example.com", "password123")}
              className="p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 rounded-xl font-bold transition text-left"
            >
              🛵 Agent
              <span className="block text-[10px] text-emerald-600 font-normal">agent@example.com</span>
            </button>
            <button
              type="button"
              onClick={() => quickLogin("admin@example.com", "password123")}
              className="p-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 rounded-xl font-bold transition text-left"
            >
              ⚙️ Admin
              <span className="block text-[10px] text-purple-600 font-normal">admin@example.com</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

