import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  selectCartItems,
  selectCartSubtotal,
  selectCartDiscount,
  selectAppliedPromo,
  selectPromoStatus,
  selectPromoError,
  applyPromoCode,
  clearPromo,
} from "../redux/cartSlice";
import { formatCountdown, hasActivePromotion } from "../utils/promo";

const Checkout = () => {
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const discount = useSelector(selectCartDiscount);
  const appliedPromo = useSelector(selectAppliedPromo);
  const promoStatus = useSelector(selectPromoStatus);
  const promoError = useSelector(selectPromoError);
  const dispatch = useDispatch();
  const [promoInput, setPromoInput] = useState(appliedPromo?.code || "");
  const [now, setNow] = useState(Date.now());
  const shipping = 30;
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotalAfterDiscount = Math.max(subtotal - discount, 0);
  const total = subtotalAfterDiscount + shipping;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const applyPromo = (e) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    const code = promoInput.trim().toUpperCase();
    setPromoInput(code);
    dispatch(applyPromoCode(code));
  };

  const clearPromoAndInput = () => {
    dispatch(clearPromo());
    setPromoInput("");
  };

  const EmptyCart = () => (
    <div className="container">
      <div className="row">
        <div className="col-md-12 py-5 bg-light text-center">
          <h4 className="p-3 display-6">No items in your cart</h4>
          <Link to="/products" className="btn btn-primary-saas mx-2">
            <i className="fa fa-arrow-left me-2" />
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );

  const OrderSummary = () => (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-light border-0 d-flex align-items-center justify-content-between">
        <h5 className="mb-0">Order Summary</h5>
        <span className="badge bg-dark text-white rounded-pill px-3">
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="card-body">
        <form className="input-group mb-3" onSubmit={applyPromo}>
          <input
            type="text"
            className="form-control"
            placeholder="Promo code"
            autoComplete="off"
            maxLength={40}
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
          />
          <button
            className="btn btn-primary-saas"
            type="submit"
            disabled={promoStatus === "loading" || !promoInput.trim()}
          >
            {promoStatus === "loading" ? "Applying..." : "Apply"}
          </button>
        </form>
        {promoError && <p className="text-danger small mb-2">{promoError}</p>}
        {appliedPromo && (
          <div className="alert alert-success py-2 px-3 d-flex justify-content-between align-items-center">
            <div>
              <strong>{appliedPromo.code}</strong>{" "}
              <span className="small text-muted">
                {appliedPromo.description || "Promo applied"}
              </span>
            </div>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={clearPromoAndInput}>
              Remove
            </button>
          </div>
        )}
        <ul className="list-group list-group-flush">
          {items.map((item) => (
            <li
              key={item.id}
              className="list-group-item d-flex align-items-start px-0 border-0 pb-3"
            >
              <img
                src={item.image}
                alt={item.title}
                className="rounded me-3"
                style={{ width: 60, height: 60, objectFit: "contain", background: "#f8f9fa" }}
              />
              <div className="flex-grow-1">
                <div className="fw-semibold text-truncate">{item.title}</div>
                {(() => {
                  const price = Number(item.price || 0);
                  const original = Number(item.originalPrice ?? item.price ?? 0);
                  const showPromo = hasActivePromotion(item);
                  const countdown = showPromo ? formatCountdown(item?.promotion?.expiresAt, now) : "";
                  return (
                    <div className="text-muted small">
                      {showPromo && (
                        <div className="text-decoration-line-through">
                          ${original.toFixed(2)} each
                        </div>
                      )}
                      <div>Qty {item.qty} · ${price.toFixed(2)} each</div>
                      {showPromo && countdown && (
                        <span className="badge bg-warning text-dark mt-1">
                          Ends in {countdown}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="fw-bold">${(Number(item.price || 0) * item.qty).toFixed(2)}</div>
            </li>
          ))}
          <li className="list-group-item d-flex justify-content-between px-0">
            <span className="text-muted">Products</span>
            <span className="fw-semibold">${subtotal.toFixed(2)}</span>
          </li>
          {discount > 0 && (
            <li className="list-group-item d-flex justify-content-between px-0">
              <span className="text-success">Promo discount {appliedPromo?.code ? `(${appliedPromo.code})` : ""}</span>
              <span className="fw-semibold text-success">- ${discount.toFixed(2)}</span>
            </li>
          )}
          <li className="list-group-item d-flex justify-content-between px-0">
            <span className="text-muted">Shipping</span>
            <span className="fw-semibold">${shipping.toFixed(2)}</span>
          </li>
          <li className="list-group-item d-flex justify-content-between px-0 border-0 pt-2">
            <span className="fw-bold">Total</span>
            <span className="fw-bold fs-5">${total.toFixed(2)}</span>
          </li>
        </ul>
      </div>
    </div>
  );

  const BillingForm = () => (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-light border-0">
        <h5 className="mb-0">Billing & Shipping</h5>
      </div>
      <div className="card-body">
        <form className="needs-validation" noValidate>
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="firstName" className="form-label">
                First name
              </label>
              <input type="text" className="form-control" id="firstName" required />
              <div className="invalid-feedback">Valid first name is required.</div>
            </div>
            <div className="col-md-6">
              <label htmlFor="lastName" className="form-label">
                Last name
              </label>
              <input type="text" className="form-control" id="lastName" required />
              <div className="invalid-feedback">Valid last name is required.</div>
            </div>
            <div className="col-12">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input type="email" className="form-control" id="email" placeholder="you@example.com" required />
              <div className="invalid-feedback">Please enter a valid email for updates.</div>
            </div>
            <div className="col-12">
              <label htmlFor="address" className="form-label">
                Address
              </label>
              <input type="text" className="form-control" id="address" placeholder="1234 Main St" required />
              <div className="invalid-feedback">Please enter your shipping address.</div>
            </div>
            <div className="col-12">
              <label htmlFor="address2" className="form-label">
                Address 2 <span className="text-muted">(Optional)</span>
              </label>
              <input type="text" className="form-control" id="address2" placeholder="Apartment or suite" />
            </div>
            <div className="col-md-5">
              <label htmlFor="country" className="form-label">
                Country
              </label>
              <select className="form-select" id="country" required>
                <option value="">Choose...</option>
                <option>India</option>
              </select>
              <div className="invalid-feedback">Please select a valid country.</div>
            </div>
            <div className="col-md-4">
              <label htmlFor="state" className="form-label">
                State
              </label>
              <select className="form-select" id="state" required>
                <option value="">Choose...</option>
                <option>Punjab</option>
              </select>
              <div className="invalid-feedback">Please provide a valid state.</div>
            </div>
            <div className="col-md-3">
              <label htmlFor="zip" className="form-label">
                Zip
              </label>
              <input type="text" className="form-control" id="zip" required />
              <div className="invalid-feedback">Zip code required.</div>
            </div>
          </div>

          <hr className="my-4" />

          <h5 className="mb-3">Payment</h5>
          <div className="row gy-3">
            <div className="col-md-6">
              <label htmlFor="cc-name" className="form-label">
                Name on card
              </label>
              <input type="text" className="form-control" id="cc-name" required />
              <small className="text-muted">Full name as displayed on card</small>
              <div className="invalid-feedback">Name on card is required</div>
            </div>
            <div className="col-md-6">
              <label htmlFor="cc-number" className="form-label">
                Credit card number
              </label>
              <input type="text" className="form-control" id="cc-number" required />
              <div className="invalid-feedback">Credit card number is required</div>
            </div>
            <div className="col-md-3">
              <label htmlFor="cc-expiration" className="form-label">
                Expiration
              </label>
              <input type="text" className="form-control" id="cc-expiration" required />
              <div className="invalid-feedback">Expiration date required</div>
            </div>
            <div className="col-md-3">
              <label htmlFor="cc-cvv" className="form-label">
                CVV
              </label>
              <input type="text" className="form-control" id="cc-cvv" required />
              <div className="invalid-feedback">Security code required</div>
            </div>
          </div>

          <hr className="my-4" />

          <button className="w-100 btn btn-primary-saas" type="submit" disabled>
            Continue to checkout
          </button>
          <p className="text-muted small mt-2 mb-0">Payments are disabled in this demo.</p>
        </form>
      </div>
    </div>
  );

  const ShowCheckout = () => (
    <div className="container py-5">
      <div className="row g-4">
        <div className="col-lg-7">
          <BillingForm />
        </div>
        <div className="col-lg-5">
          <OrderSummary />
        </div>
      </div>
    </div>
  );

  return (
    <div className="container my-3 py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <p className="text-uppercase text-muted small mb-1">Checkout</p>
          <h1 className="h3 fw-bold mb-0">Review & pay</h1>
        </div>
        <Link to="/cart" className="btn btn-outline-saas">
          Back to cart
        </Link>
      </div>
      <hr />
      {items.length ? <ShowCheckout /> : <EmptyCart />}
    </div>
  );
};

export default Checkout;
