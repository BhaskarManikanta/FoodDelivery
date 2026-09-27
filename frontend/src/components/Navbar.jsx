import { Link } from "react-router-dom";
import { useContext } from "react";
import { useSelector } from "react-redux";

import { AuthContext } from "../context/AuthContext";

function Navbar() {

  const { user, logout } = useContext(AuthContext);
  const cartCount = useSelector((state) =>
    state.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  return (
    <div className="flex justify-between items-center p-4 shadow">

      <Link to="/">
        <h1 className="text-2xl font-bold">
          Food App
        </h1>
      </Link>

      <div className="flex gap-4 items-center">

        {!user ? (
          <>
            <Link to="/login">
              Login
            </Link>

            <Link to="/register">
              Register
            </Link>
          </>
        ) : (
          <>
            <Link to="/cart">
              Cart{cartCount > 0 ? ` (${cartCount})` : ""}
            </Link>

            <Link to="/orders">
              Orders
            </Link>

            <Link to="/profile">
              Profile
            </Link>

            <button onClick={logout}>
              Logout
            </button>
          </>
        )}

      </div>

    </div>
  );
}

export default Navbar;
