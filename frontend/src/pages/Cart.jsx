// src/pages/Cart.jsx

import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";

import {
  selectCartItems,
  selectCartSubtotal,
  selectCartDiscount,
  selectAppliedPromo,
  selectCartStatus,
  selectCartError,
  addItem,
  decreaseItem,
  removeItem,
} from "../redux/cartSlice";
import { formatPromotionBadge, hasActivePromotion } from "../utils/promo";

const Cart = () => {
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const discount = useSelector(selectCartDiscount);
  const appliedPromo = useSelector(selectAppliedPromo);
  const status = useSelector(selectCartStatus);
  const error = useSelector(selectCartError);
  const dispatch = useDispatch();

  if ((!items || items.length === 0) && status !== "loading") {
    return (
      <>
        <div className="container py-5">
          <h2 className="mb-4">Your Cart</h2>
          <p>Your cart is currently empty.</p>
          <Link to="/products" className="btn btn-dark mt-3">
            Go Shopping
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container py-5">
        <h2 className="mb-4">Your Cart</h2>

        {status === "loading" && <p>Syncing with backend...</p>}
        {error && <p className="text-danger">{error}</p>}

        {items.map((item) => (
          <div className="row align-items-center border-bottom py-3" key={item.id}>
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
              {(() => {
                const price = Number(item.price || 0);
                const original = Number(item.originalPrice ?? item.price ?? 0);
                const showPromo = hasActivePromotion(item);
                const badge = showPromo ? formatPromotionBadge(item) : "";
                return (
                  <div>
                    {showPromo && (
                      <div className="small text-muted text-decoration-line-through">
                        ${original.toFixed(2)} each
                      </div>
                    )}
                    <div className="small text-muted">${price.toFixed(2)} each</div>
                    {showPromo && badge && (
                      <span className="badge bg-warning text-dark mt-1">
                        {badge}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="col-md-3 col-6 mt-3 mt-md-0">
              <div className="d-flex align-items-center">
                <button
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                  type="button"
                  onClick={() => dispatch(decreaseItem(item.id))}
                >
                  –
                </button>
                <span className="mx-3">{item.qty}</span>
                <button
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                  type="button"
                  onClick={() => dispatch(addItem(item))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="col-md-2 col-4 mt-3 mt-md-0">
              <strong>${(Number(item.price || 0) * item.qty).toFixed(2)}</strong>
            </div>

            <div className="col-md-1 col-4 mt-3 mt-md-0 text-end">
              <button
                className="btn btn-link text-danger p-0 text-decoration-underline"
                type="button"
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
        {discount > 0 && (
          <div className="d-flex justify-content-between align-items-center mt-2">
            <h6 className="text-success mb-0">
              Promo {appliedPromo?.code ? `(${appliedPromo.code})` : ""}
            </h6>
            <h6 className="text-success mb-0">- ${discount.toFixed(2)}</h6>
          </div>
        )}

        <div className="mt-3 d-flex justify-content-between">
          <Link to="/products" className="btn btn-outline-secondary">
            Continue Shopping
          </Link>
          <Link to="/checkout" className="btn btn-dark">
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </>
  );
};

export default Cart;
