import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";

import { loginRequest } from "../api/auth";
import {
  loginFailure,
  loginStart,
  loginSuccess,
  selectAuthError,
  selectAuthLoading,
  selectCurrentUser,
} from "../redux/authSlice";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector(selectCurrentUser);
  const loading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);

  useEffect(() => {
    if (currentUser) {
      const next = currentUser.role === "customer" ? "/dashboard/customer" : "/dashboard/admin";
      navigate(next, { replace: true });
    }
  }, [currentUser, navigate]);

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    dispatch(loginStart());
    try {
      const response = await loginRequest(form.email, form.password);
      dispatch(loginSuccess(response.user));
      toast.success("Welcome back!");
      navigate(response.redirectTo);
    } catch (err) {
      const message = err.message || "Unable to sign in";
      dispatch(loginFailure(message));
      toast.error(message);
    }
  };

  return (
    <div className="container my-5 py-5">
      <div className="row justify-content-center">
        <div className="col-lg-5">
          <div className="card-saas p-4 p-md-5">
            <div className="mb-4 text-center">
            </div>
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="email" className="form-label fw-semibold">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-control"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center">
                  <label htmlFor="password" className="form-label fw-semibold mb-0">
                    Password
                  </label>  
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="form-control"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="alert alert-danger py-2" role="alert">
                  {error}
                </div>
              )}

              <div className="d-grid mt-4">
                <button className="btn btn-primary-saas" type="submit" disabled={loading}>
                  {loading ? "Signing you in..." : "Login"}
                </button>
              </div>
            </form>
            <div className="mt-4 text-center">
              <span className="text-muted">New here? </span>
              <Link to="/register" className="text-decoration-underline text-info">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
