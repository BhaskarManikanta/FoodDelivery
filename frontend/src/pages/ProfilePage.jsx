import { useContext } from "react";

import { AuthContext } from "../context/AuthContext";

function ProfilePage() {

  const { user } = useContext(AuthContext);

  return (
    <div className="p-10">

      <h1 className="text-3xl font-bold mb-5">
        Profile
      </h1>

      <div className="shadow p-5 rounded w-[400px]">

        <p>
          <strong>Name:</strong> {user?.name}
        </p>

        <p>
          <strong>Email:</strong> {user?.email}
        </p>

        <p>
          <strong>Role:</strong> {user?.role}
        </p>

      </div>

    </div>
  );
}

export default ProfilePage;