import { Link, useNavigate } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";
import { getMyNotifications } from "../services/notificationService";
import NotificationModal from "./NotificationModal";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const cartCount = useSelector((state) =>
    state.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  useEffect(() => {
    if (!user) return;

    // Fetch initial unread count
    getMyNotifications(1, 10)
      .then((res) => {
        setUnreadCount(res.unreadCount || 0);
      })
      .catch(() => {});

    const token = localStorage.getItem("token");
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token }
    });

    socket.on("notification:new", () => {
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case "restaurant":
        return <span className="bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">Restaurant</span>;
      case "agent":
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">Delivery Agent</span>;
      case "admin":
        return <span className="bg-purple-100 text-purple-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">Admin</span>;
      default:
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">Customer</span>;
    }
  };

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white text-xl font-black shadow-md shadow-orange-200">
              ⚡
            </span>
            <span className="text-2xl font-black tracking-tight text-gray-900">
              Quick<span className="text-orange-600">Bite</span>
            </span>
          </Link>

          <div className="flex gap-4 md:gap-6 items-center">
            <Link
              to="/"
              className="text-gray-600 hover:text-orange-600 font-medium text-sm transition"
            >
              Browse
            </Link>

            {!user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-orange-600 font-medium text-sm px-3 py-2 rounded-lg transition"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm shadow-orange-300 transition"
                >
                  Sign Up
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {/* Role specific links */}
                {user.role === "customer" && (
                  <>
                    <Link
                      to="/orders"
                      className="text-gray-600 hover:text-orange-600 font-medium text-sm transition"
                    >
                      Orders
                    </Link>
                    <Link
                      to="/cart"
                      className="relative flex items-center gap-1.5 text-gray-700 hover:text-orange-600 font-medium text-sm bg-gray-50 hover:bg-orange-50 px-3 py-1.5 rounded-full border border-gray-200 transition"
                    >
                      <span>🛒 Cart</span>
                      {cartCount > 0 && (
                        <span className="bg-orange-600 text-white text-xs font-bold px-1.5 py-0.2 rounded-full min-w-5 text-center">
                          {cartCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}

                {user.role === "restaurant" && (
                  <Link
                    to="/restaurant/dashboard"
                    className="text-amber-700 hover:text-amber-800 font-semibold text-sm bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 transition flex items-center gap-1"
                  >
                    <span>🍳 Restaurant Dashboard</span>
                  </Link>
                )}

                {user.role === "agent" && (
                  <Link
                    to="/agent/dashboard"
                    className="text-emerald-700 hover:text-emerald-800 font-semibold text-sm bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition flex items-center gap-1"
                  >
                    <span>🛵 Agent Dashboard</span>
                  </Link>
                )}

                {user.role === "admin" && (
                  <Link
                    to="/admin/dashboard"
                    className="text-purple-700 hover:text-purple-800 font-semibold text-sm bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 transition flex items-center gap-1"
                  >
                    <span>⚙️ Admin Center</span>
                  </Link>
                )}

                {/* Notifications Bell */}
                <button
                  onClick={() => setIsNotifOpen(true)}
                  className="relative p-2 text-gray-600 hover:text-orange-600 hover:bg-gray-100 rounded-full transition"
                  title="Notifications"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* User Profile & Role */}
                <Link
                  to="/profile"
                  className="flex items-center gap-2 pl-2 border-l border-gray-200"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="hidden sm:flex flex-col text-left">
                    <span className="text-xs font-semibold text-gray-900 leading-tight">
                      {user.name}
                    </span>
                    {getRoleBadge(user.role)}
                  </div>
                </Link>

                <button
                  onClick={handleLogout}
                  className="text-xs font-medium text-gray-500 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition"
                  title="Logout"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <NotificationModal
        isOpen={isNotifOpen}
        onClose={() => {
          setIsNotifOpen(false);
          setUnreadCount(0);
        }}
      />
    </nav>
  );
}

export default Navbar;

