import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";

import { registerRequest } from "../api/auth";
import { loginStart, loginSuccess, loginFailure, selectAuthLoading, selectAuthError } from "../redux/authSlice";

const Register = () => {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const loading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (evt) => {
    evt.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    dispatch(loginStart());
    registerRequest(form.fullName, form.email, form.password)
      .then((response) => {
        dispatch(loginSuccess(response.user));
        toast.success("Account created");
        navigate(response.redirectTo || "/dashboard/customer", { replace: true });
      })
      .catch((err) => {
        const message = err.message || "Unable to register";
        dispatch(loginFailure(message));
        toast.error(message);
      });
  };

  return (
    <div className="container my-5 py-5">
      <div className="row justify-content-center">
        <div className="col-lg-5">
          <div className="card-saas p-4 p-md-5">
            <div className="mb-4 text-center">
              <h2 className="mb-1">Create account</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="fullName" className="form-label fw-semibold">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  className="form-control"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="Enter your name"
                  autoComplete="name"
                  required
                />
              </div>

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
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label fw-semibold">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="form-control"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="mb-3">
                <label htmlFor="confirmPassword" className="form-label fw-semibold">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  className="form-control"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="d-grid mt-4">
                <button className="btn btn-primary-saas" type="submit" disabled={loading}>
                  {loading ? "Creating account..." : "Register"}
                </button>
              </div>
            </form>

            {error && (
              <div className="alert alert-danger py-2 mt-3" role="alert">
                {error}
              </div>
            )}

            <div className="mt-4 text-center">
              <span className="text-muted">Already have an account? </span>
              <Link to="/login" className="text-decoration-underline text-info">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
