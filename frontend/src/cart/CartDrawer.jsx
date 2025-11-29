// src/cart/CartDrawer.jsx

import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { NavLink } from "react-router-dom";

import {
  selectCartItems,
  selectCartSubtotal,
  addItem,
  decreaseItem,
  removeItem,
} from "../redux/cartSlice";

import "../styles/CartDrawer.css";   // <-- your cart drawer CSS file

const CartDrawer = ({ isOpen, onClose }) => {
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const dispatch = useDispatch();

  return (
    <>
      {/* Dim overlay */}
      <div
        className={`cart-overlay ${isOpen ? "open" : ""}`}
        onClick={onClose}
      />

      {/* Sliding Drawer */}
      <div className={`cart-drawer ${isOpen ? "open" : ""}`}>
        <div className="cart-header">
          <h4>Your Cart</h4>
          <button className="cart-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* If cart is empty */}
        {items.length === 0 ? (
          <p className="cart-empty">Your cart is empty.</p>
        ) : (
          <>
            {/* Cart items */}
            <div className="cart-items">
              {items.map((item) => (
                <div className="cart-item d-flex align-items-start" key={item.id}>
                  <img
                    src={item.image}
                    alt={item.title}
                    className="cart-item-image"
                  />

                  <div className="cart-item-info">
                    <div className="cart-item-title">{item.title}</div>

                    <div className="cart-item-price">
                      ${item.price.toFixed(2)}
                    </div>

                    <div className="cart-item-qty d-flex align-items-center mt-2">
                      <button
                        className="qty-btn btn btn-outline-secondary btn-sm rounded-pill px-3"
                        type="button"
                        onClick={() => dispatch(decreaseItem(item.id))}
                      >
                        –
                      </button>
                      <span className="mx-3">{item.qty}</span>
                      <button
                        className="qty-btn btn btn-outline-secondary btn-sm rounded-pill px-3"
                        type="button"
                        onClick={() => dispatch(addItem(item))}
                      >
                        +
                      </button>
                      <button
                        className="remove-btn ms-3 btn btn-link text-danger p-0 text-decoration-underline"
                        type="button"
                        onClick={() => dispatch(removeItem(item.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer: subtotal + actions */}
            <div className="cart-footer">
              <div className="cart-subtotal">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              <div className="cart-actions">
                <NavLink to="/cart" className="btn btn-outline-saas w-100 mb-2" onClick={onClose}>
                  View Cart
                </NavLink>

                <NavLink to="/checkout" className="btn btn-primary-saas w-100" onClick={onClose}>
                  Checkout
                </NavLink>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
