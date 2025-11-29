// src/components/Navbar.jsx

import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";

import CartDrawer from "../cart/CartDrawer";
import { selectCartCount } from "../redux/cartSlice";
import { logout, selectCurrentUser } from "../redux/authSlice";

import "../styles/Navbar.css";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const dispatch = useDispatch();

  const cartCount = useSelector(selectCartCount);
  const currentUser = useSelector(selectCurrentUser);
  const dashboardRoute = "/dashboard/customer";
  const accountLabel =
    (currentUser?.fullName && currentUser.fullName.trim()) ||
    currentUser?.email?.split("@")[0] ||
    "Account";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("cart-open", isCartOpen);
  }, [isCartOpen]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleLogout = () => {
    dispatch(logout());
  };

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg sticky-top ${
          isScrolled ? "glass-panel py-2" : "bg-transparent py-4"
        }`}
        style={{ transition: "all 0.3s ease" }}
      >
        <div className="container">
          {/* Brand */}
          <NavLink className="navbar-brand d-flex align-items-center gap-2" to="/">
            <div className="brand-logo-wrapper">
              <img src="/assets/logo/logo.png" alt="Tachyon logo" className="brand-logo" />
            </div>
            <span className="brand-text">Tachyon</span>
          </NavLink>

          {/* Mobile toggler */}
          <button
            className="navbar-toggler border-0"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          {/* Links + Cart button */}
          <div className="collapse navbar-collapse" id="navbarSupportedContent">
            <ul className="navbar-nav mx-auto mb-2 mb-lg-0 gap-lg-4">
              <li className="nav-item">
                <NavLink className="nav-link" to="/">
                  Home
                </NavLink>
              </li>

              <li className="nav-item">
                <NavLink className="nav-link" to="/products">
                  Products
                </NavLink>
              </li>

              <li className="nav-item">
                <NavLink className="nav-link" to="/about">
                  About
                </NavLink>
              </li>
            </ul>

            {/* Right side actions */}
            <div className="d-flex align-items-center gap-3">
              {!currentUser && (
                <NavLink className="nav-link fw-medium" to="/login">
                  Log in
                </NavLink>
              )}

              {currentUser && (
                <>
                  <NavLink className="btn btn-outline-saas px-3" to={dashboardRoute}>
                    <i className="fa fa-user-circle" aria-hidden="true" />
                    <span className="d-none d-md-inline ms-2">{accountLabel}</span>
                  </NavLink>
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none text-muted"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              )}

              <button
                className="btn btn-outline-saas theme-toggle p-2"
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                style={{ width: "40px", height: "40px", padding: 0 }}
              >
                <i className={`fa fa-${theme === "dark" ? "sun-o" : "moon-o"}`} />
              </button>

              <button
                className="btn btn-primary-saas position-relative"
                onClick={() => setIsCartOpen(true)}
              >
                <i className="fa fa-shopping-cart" />
                <span className="d-none d-md-inline">Cart</span>
                {cartCount > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-light">
                    {cartCount}
                    <span className="visually-hidden">items in cart</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>
      {/* Cart Drawer component */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
};

export default Navbar;
