// src/pages/Cart.jsx

import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";

import {
  selectCartItems,
  selectCartSubtotal,
  addItem,
  decreaseItem,
  removeItem,
} from "../redux/cartSlice";

import { Footer } from "../components";

const Cart = () => {
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const dispatch = useDispatch();

  if (!items || items.length === 0) {
    return (
      <>
        <div className="container py-5">
          <h2 className="mb-4">Your Cart</h2>
          <p>Your cart is currently empty.</p>
          <Link to="/product" className="btn btn-dark mt-3">
            Go Shopping
          </Link>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div className="container py-5">
        <h2 className="mb-4">Your Cart</h2>

        {items.map((item) => (
          <div
            className="row align-items-center border-bottom py-3"
            key={item.id}
          >
            <div className="col-md-2 col-4">
              <img
                src={item.image}
                alt={item.title}
                className="img-fluid"
                style={{ maxHeight: "80px", objectFit: "contain" }}
              />
            </div>

            <div className="col-md-4 col-8">
              <h6 className="mb-1">{item.title}</h6>
              <small className="text-muted">
                ${item.price.toFixed(2)} each
              </small>
            </div>

            <div className="col-md-3 col-6 mt-3 mt-md-0">
              <div className="d-flex align-items-center">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => dispatch(decreaseItem(item.id))}
                >
                  -
                </button>
                <span className="mx-2">{item.qty}</span>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => dispatch(addItem(item))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="col-md-2 col-4 mt-3 mt-md-0">
              <strong>${(item.price * item.qty).toFixed(2)}</strong>
            </div>

            <div className="col-md-1 col-4 mt-3 mt-md-0 text-end">
              <button
                className="btn btn-link text-danger p-0"
                onClick={() => dispatch(removeItem(item.id))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <div className="d-flex justify-content-between align-items-center mt-4">
          <h4>Subtotal:</h4>
          <h4>${subtotal.toFixed(2)}</h4>
        </div>

        <div className="mt-3 d-flex justify-content-between">
          <Link to="/product" className="btn btn-outline-secondary">
            Continue Shopping
          </Link>
          <Link to="/checkout" className="btn btn-dark">
            Proceed to Checkout
          </Link>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Cart;
