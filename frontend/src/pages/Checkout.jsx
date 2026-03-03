import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  selectCartItems,
  selectCartSubtotal,
  selectCartDiscount,
  selectCartId,
  selectCartToken,
  selectAppliedPromo,
  selectPromoStatus,
  selectPromoError,
  applyPromoCode,
  clearPromo,
  clearCart,
} from "../redux/cartSlice";
import { hasActivePromotion } from "../utils/promo";
import { selectCurrentUser } from "../redux/authSlice";
import { fetchCustomerDashboard, createAddress, createPaymentMethod } from "../api/auth";
import { placeOrder } from "../api/orders";
import "../styles/checkout.css";

const Checkout = () => {
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const discount = useSelector(selectCartDiscount);
  const cartId = useSelector(selectCartId);
  const cartToken = useSelector(selectCartToken);
  const appliedPromo = useSelector(selectAppliedPromo);
  const promoStatus = useSelector(selectPromoStatus);
  const promoError = useSelector(selectPromoError);
  const currentUser = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [promoInput, setPromoInput] = useState(appliedPromo?.code || "");
  const [promoValidationError, setPromoValidationError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [useNewPayment, setUseNewPayment] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [addressForm, setAddressForm] = useState({
    label: "Home",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    country: "",
    phone: "",
    isDefault: false,
  });
  const [paymentForm, setPaymentForm] = useState({
    brand: "",
    cardNumber: "",
    expiry: "",
    isDefault: false,
  });

  const shipping = 30;
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotalAfterDiscount = Math.max(subtotal - discount, 0);
  const total = subtotalAfterDiscount + shipping;

  const orderRows = useMemo(() => {
    return items.map((item) => {
      const price = Number(item.price || 0);
      const original = Number(item.originalPrice ?? item.price ?? 0);
      const showPromo = hasActivePromotion(item);
      return { item, price, original, showPromo };
    });
  }, [items]);

  const updateAddressField = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setAddressForm((prev) => ({ ...prev, [key]: value }));
  };

  const updatePaymentField = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setPaymentForm((prev) => ({ ...prev, [key]: value }));
  };

  const sanitizePromoCode = (value) => value.replace(/[^A-Za-z0-9]/g, "");
  const isValidPromoCode = (value) => /^[A-Za-z0-9]+$/.test(value);

  const applyPromo = (e) => {
    e.preventDefault();
    const trimmedCode = promoInput.trim();
    if (!trimmedCode) return;
    if (!isValidPromoCode(trimmedCode)) {
      setPromoValidationError("Promo codes can only contain letters and numbers.");
      return;
    }
    setPromoValidationError("");
    dispatch(applyPromoCode(trimmedCode));
  };

  const clearPromoAndInput = () => {
    dispatch(clearPromo());
    setPromoInput("");
  };

  useEffect(() => {
    if (!currentUser?.id) return;

    const loadAddresses = async () => {
      setAddressesLoading(true);
      setAddressError("");
      try {
        const response = await fetchCustomerDashboard(currentUser.id, "shipping");
        const rows = response.shippingAddresses || [];
        setAddresses(rows);
        if (rows.length === 0) {
          setUseNewAddress(true);
        } else {
          const defaultAddress = rows.find((addr) => addr.isDefault);
          setSelectedAddressId(defaultAddress?.id || rows[0].id);
        }
      } catch (err) {
        setAddressError(err.message || "Unable to load saved addresses");
      } finally {
        setAddressesLoading(false);
      }
    };

    const loadPayments = async () => {
      setPaymentsLoading(true);
      setPaymentError("");
      try {
        const response = await fetchCustomerDashboard(currentUser.id, "payments");
        const rows = response.savedPayments || [];
        setPayments(rows);
        if (rows.length === 0) {
          setUseNewPayment(true);
        } else {
          const defaultPayment = rows.find((card) => card.isDefault);
          setSelectedPaymentId(defaultPayment?.id || rows[0].id);
        }
      } catch (err) {
        setPaymentError(err.message || "Unable to load saved cards");
      } finally {
        setPaymentsLoading(false);
      }
    };

    loadAddresses();
    loadPayments();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!showConfirmModal) return;
    const timer = setTimeout(() => {
      navigate("/dashboard/customer/orders");
    }, 2500);
    return () => clearTimeout(timer);
  }, [showConfirmModal, navigate]);

  const saveAddress = async () => {
    if (!currentUser?.id) return null;
    const required = ["label", "recipient", "line1", "city", "postalCode", "country"];
    for (const field of required) {
      if (!addressForm[field]?.toString().trim()) {
        setAddressError(`${field} is required`);
        return null;
      }
    }
    setAddressSaving(true);
    setAddressError("");
    try {
      const created = await createAddress(currentUser.id, addressForm);
      const nextAddresses = [created, ...addresses.filter((addr) => addr.id !== created.id)];
      setAddresses(nextAddresses);
      setSelectedAddressId(created.id);
      setUseNewAddress(false);
      toast.success("Address saved");
      return created;
    } catch (err) {
      setAddressError(err.message || "Unable to save address");
      return null;
    } finally {
      setAddressSaving(false);
    }
  };

  const savePayment = async () => {
    if (!currentUser?.id) return null;
    const cardDigits = paymentForm.cardNumber.replace(/\D/g, "");
    const last4 = cardDigits.slice(-4);
    if (!paymentForm.brand.trim()) {
      setPaymentError("brand is required");
      return null;
    }
    if (!last4 || last4.length !== 4) {
      setPaymentError("card number must include at least 4 digits");
      return null;
    }
    if (!paymentForm.expiry.trim()) {
      setPaymentError("expiry is required");
      return null;
    }
    setPaymentSaving(true);
    setPaymentError("");
    try {
      const created = await createPaymentMethod(currentUser.id, {
        brand: paymentForm.brand,
        last4,
        expiry: paymentForm.expiry,
        isDefault: paymentForm.isDefault,
      });
      const nextPayments = [created, ...payments.filter((card) => card.id !== created.id)];
      setPayments(nextPayments);
      setSelectedPaymentId(created.id);
      setUseNewPayment(false);
      toast.success("Card saved");
      return created;
    } catch (err) {
      setPaymentError(err.message || "Unable to save card");
      return null;
    } finally {
      setPaymentSaving(false);
    }
  };

  const placeOrderNow = async () => {
    if (!currentUser?.id) return;
    if (!cartId) {
      toast.error("Unable to locate your cart.");
      return;
    }
    if (!cartToken) {
      toast.error("Unable to validate your cart.");
      return;
    }
    setPlacingOrder(true);
    try {
      let addressId = selectedAddressId;
      if (useNewAddress) {
        const created = await saveAddress();
        addressId = created?.id || "";
      }
      if (!addressId) {
        toast.error("Please select a shipping address.");
        setPlacingOrder(false);
        return;
      }
      let paymentId = selectedPaymentId;
      if (useNewPayment) {
        const created = await savePayment();
        paymentId = created?.id || "";
      }
      if (!paymentId) {
        toast.error("Please select a payment method.");
        setPlacingOrder(false);
        return;
      }
      const response = await placeOrder({
        cartId,
        cartToken,
        promoCode: appliedPromo?.code || "",
        shipping,
        addressId,
        paymentId,
        userId: currentUser.id,
      });
      setConfirmedOrder(response);
      setShowConfirmModal(true);
      dispatch(clearCart());
      clearPromoAndInput();
    } catch (err) {
      toast.error(err.message || "Unable to place order");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="checkout-gate">
        <div className="checkout-modal" role="dialog" aria-modal="true">
          <div className="checkout-modal-card">
            <h4 className="mb-2">Login required</h4>
            <p className="text-muted mb-4">
              Please log in or register to continue to checkout.
            </p>
            <div className="d-flex flex-wrap gap-2">
              <Link to="/login" className="btn btn-primary-saas">
                Log in
              </Link>
              <Link to="/register" className="btn btn-outline-saas">
                Register
              </Link>
              <Link to="/cart" className="btn btn-outline-saas">
                Back to cart
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!items.length && !showConfirmModal) {
    return (
      <div className="container my-3 py-3">
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
  }

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

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-light border-0">
              <h5 className="mb-0">Billing & Shipping</h5>
            </div>
            <div className="card-body">
              <div className="checkout-section">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h5 className="mb-0">Shipping address</h5>
                  {!useNewAddress && (
                    <button
                      type="button"
                      className="btn btn-outline-saas btn-sm"
                      onClick={() => setUseNewAddress(true)}
                    >
                      Add new address
                    </button>
                  )}
                </div>
                {addressesLoading && <p className="text-muted small">Loading saved addresses...</p>}
                {addressError && <p className="text-danger small">{addressError}</p>}
                {!useNewAddress && addresses.length > 0 && (
                  <div className="checkout-option-list">
                    {addresses.map((address) => (
                      <label className="checkout-option" key={address.id}>
                        <input
                          type="radio"
                          name="shippingAddress"
                          checked={selectedAddressId === address.id}
                          onChange={() => setSelectedAddressId(address.id)}
                        />
                        <div>
                          <div className="fw-semibold">{address.label}</div>
                          <div className="text-muted small">
                            {address.recipient} - {address.line1}
                            {address.line2 ? `, ${address.line2}` : ""} - {address.city}{" "}
                            {address.postalCode}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {useNewAddress && (
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="address-label" className="form-label">Label</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-label"
                        value={addressForm.label}
                        onChange={updateAddressField("label")}
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="address-recipient" className="form-label">Recipient</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-recipient"
                        value={addressForm.recipient}
                        onChange={updateAddressField("recipient")}
                      />
                    </div>
                    <div className="col-12">
                      <label htmlFor="address-line1" className="form-label">Address line 1</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-line1"
                        value={addressForm.line1}
                        onChange={updateAddressField("line1")}
                      />
                    </div>
                    <div className="col-12">
                      <label htmlFor="address-line2" className="form-label">Address line 2</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-line2"
                        value={addressForm.line2}
                        onChange={updateAddressField("line2")}
                      />
                    </div>
                    <div className="col-md-5">
                      <label htmlFor="address-city" className="form-label">City</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-city"
                        value={addressForm.city}
                        onChange={updateAddressField("city")}
                      />
                    </div>
                    <div className="col-md-4">
                      <label htmlFor="address-postal" className="form-label">Postal code</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-postal"
                        value={addressForm.postalCode}
                        onChange={updateAddressField("postalCode")}
                      />
                    </div>
                    <div className="col-md-3">
                      <label htmlFor="address-country" className="form-label">Country</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-country"
                        value={addressForm.country}
                        onChange={updateAddressField("country")}
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="address-phone" className="form-label">Phone (optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        id="address-phone"
                        value={addressForm.phone}
                        onChange={updateAddressField("phone")}
                      />
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="address-default"
                          checked={addressForm.isDefault}
                          onChange={updateAddressField("isDefault")}
                        />
                        <label className="form-check-label" htmlFor="address-default">
                          Set as default
                        </label>
                      </div>
                    </div>
                    <div className="col-12 d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary-saas"
                        onClick={saveAddress}
                        disabled={addressSaving}
                      >
                        {addressSaving ? "Saving..." : "Save address"}
                      </button>
                      {addresses.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-outline-saas"
                          onClick={() => setUseNewAddress(false)}
                          disabled={addressSaving}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <hr className="my-4" />

              <div className="checkout-section">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h5 className="mb-0">Payment method</h5>
                  {!useNewPayment && (
                    <button
                      type="button"
                      className="btn btn-outline-saas btn-sm"
                      onClick={() => setUseNewPayment(true)}
                    >
                      Add new card
                    </button>
                  )}
                </div>
                {paymentsLoading && <p className="text-muted small">Loading saved cards...</p>}
                {paymentError && <p className="text-danger small">{paymentError}</p>}
                {!useNewPayment && payments.length > 0 && (
                  <div className="checkout-option-list">
                    {payments.map((card) => (
                      <label className="checkout-option" key={card.id}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          checked={selectedPaymentId === card.id}
                          onChange={() => setSelectedPaymentId(card.id)}
                        />
                        <div>
                          <div className="fw-semibold">
                            {card.brand} **** {card.last4}
                          </div>
                          <div className="text-muted small">Expires {card.expiry}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {useNewPayment && (
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="card-brand" className="form-label">Card brand</label>
                      <input
                        type="text"
                        className="form-control"
                        id="card-brand"
                        value={paymentForm.brand}
                        onChange={updatePaymentField("brand")}
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="card-number" className="form-label">Card number</label>
                      <input
                        type="text"
                        className="form-control"
                        id="card-number"
                        value={paymentForm.cardNumber}
                        onChange={updatePaymentField("cardNumber")}
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="card-expiry" className="form-label">Expiry</label>
                      <input
                        type="text"
                        className="form-control"
                        id="card-expiry"
                        value={paymentForm.expiry}
                        onChange={updatePaymentField("expiry")}
                      />
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="card-default"
                          checked={paymentForm.isDefault}
                          onChange={updatePaymentField("isDefault")}
                        />
                        <label className="form-check-label" htmlFor="card-default">
                          Set as default
                        </label>
                      </div>
                    </div>
                    <div className="col-12 d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary-saas"
                        onClick={savePayment}
                        disabled={paymentSaving}
                      >
                        {paymentSaving ? "Saving..." : "Save card"}
                      </button>
                      {payments.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-outline-saas"
                          onClick={() => setUseNewPayment(false)}
                          disabled={paymentSaving}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <hr className="my-4" />

              <button
                className="w-100 btn btn-primary-saas"
                type="button"
                onClick={placeOrderNow}
                disabled={placingOrder}
              >
                {placingOrder ? "Placing order..." : "Place order"}
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
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
                  onChange={(e) => {
                    const raw = e.target.value;
                    const sanitized = sanitizePromoCode(raw);
                    setPromoInput(sanitized);
                    setPromoValidationError(
                      raw === sanitized ? "" : "Promo codes can only contain letters and numbers."
                    );
                  }}
                />
                <button
                  className="btn btn-primary-saas"
                  type="submit"
                  disabled={promoStatus === "loading" || !promoInput.trim()}
                >
                  {promoStatus === "loading" ? "Applying..." : "Apply"}
                </button>
              </form>
              {promoValidationError && <p className="text-danger small mb-2">{promoValidationError}</p>}
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
                {orderRows.map(({ item, price, original, showPromo }) => (
                  <li
                    key={item.id}
                    className="list-group-item d-flex align-items-start px-0 border-0 pb-3 checkout-order-row"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="rounded me-3"
                      style={{ width: 60, height: 60, objectFit: "contain", background: "#f8f9fa" }}
                    />
                    <div className="flex-grow-1 checkout-order-main">
                      <div className="fw-semibold text-truncate">{item.title}</div>
                      <div className="text-muted small">
                        {showPromo && (
                          <div className="text-decoration-line-through">
                            ${original.toFixed(2)} each
                          </div>
                        )}
                        <div>Qty {item.qty} - ${price.toFixed(2)} each</div>
                      </div>
                    </div>
                    <div className="fw-bold checkout-order-total">
                      ${(Number(item.price || 0) * item.qty).toFixed(2)}
                    </div>
                  </li>
                ))}
                <li className="list-group-item d-flex justify-content-between px-0">
                  <span className="text-muted">Products</span>
                  <span className="fw-semibold">${subtotal.toFixed(2)}</span>
                </li>
                {discount > 0 && (
                  <li className="list-group-item d-flex justify-content-between px-0">
                    <span className="text-success">
                      Promo discount {appliedPromo?.code ? `(${appliedPromo.code})` : ""}
                    </span>
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
        </div>
      </div>
      {showConfirmModal && (
        <div className="checkout-modal" role="dialog" aria-modal="true">
          <div className="checkout-modal-card">
            <h4 className="mb-2">Order confirmed</h4>
            <p className="text-muted mb-3">
              Your order {confirmedOrder?.orderId ? `#${confirmedOrder.orderId}` : ""} is now processing.
            </p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary-saas"
                onClick={() => navigate("/dashboard/customer/orders")}
              >
                View orders
              </button>
              <button
                type="button"
                className="btn btn-outline-saas"
                onClick={() => setShowConfirmModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Checkout;
