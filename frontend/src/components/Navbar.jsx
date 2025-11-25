// src/components/Navbar.jsx

import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";

import CartDrawer from "../cart/CartDrawer";
import { selectCartCount } from "../redux/cartSlice";

import "../styles/Navbar.css";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 👇 Get total items in cart from Redux
  const cartCount = useSelector(selectCartCount);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg navbar-light bg-light sticky-top ${
          isScrolled ? "navbar-shrink" : ""
        }`}
      >
        <div className="container">
          {/* Brand */}
          <NavLink className="navbar-brand fw-bold fs-4 px-2" to="/">
            React Ecommerce
          </NavLink>

          {/* Mobile toggler */}
          <button
            className="navbar-toggler mx-2"
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
            <ul className="navbar-nav ms-auto mb-2 mb-lg-0">
              <li className="nav-item">
                <NavLink className="nav-link" to="/">
                  Home
                </NavLink>
              </li>

              <li className="nav-item">
                <NavLink className="nav-link" to="/product">
                  Products
                </NavLink>
              </li>

              <li className="nav-item">
                <NavLink className="nav-link" to="/about">
                  About
                </NavLink>
              </li>

              <li className="nav-item">
                <NavLink className="nav-link" to="/contact">
                  Contact
                </NavLink>
              </li>
            </ul>

            {/* Cart button (right side) */}
            <button
              className="btn btn-outline-dark ms-lg-3 mt-2 mt-lg-0 cart-btn"
              onClick={() => setIsCartOpen(true)}
            >
              <i className="fa fa-shopping-cart me-2" />
              Cart ({cartCount})
            </button>
          </div>
        </div>
      </nav>

      {/* Cart Drawer component */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
};

export default Navbar;
