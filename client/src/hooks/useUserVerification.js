import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../config/axiosConfig";

const useUserVerification = (setUser) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const res = await apiClient(`/verify-user/`, { withCredentials: true });

        if (res.data.user) {
          setUser(res.data.user);
        } else {
          setUser(null);
          navigate("/");
        }
      } catch (error) {
        setUser(null);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    getUser();
  }, [navigate, setUser]);

  return loading;
};

export default useUserVerification;
