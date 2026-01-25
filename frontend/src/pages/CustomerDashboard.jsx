import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "react-hot-toast";

import {
  fetchCustomerDashboard,
  updateCustomerProfile,
  createAddress,
  updateAddress,
  deleteAddress,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  changePassword,
  logoutRequest,
} from "../api/auth";
import { logout, selectCurrentUser, setUserDetails } from "../redux/authSlice";

import "../styles/dashboard.css";

const DASHBOARD_SECTIONS = [
  { id: "profile", label: "Profile", group: "My Account" },
  { id: "password", label: "Change Password", group: "My Account" },
  { id: "payments", label: "Banks & Cards", group: "My Account" },
  { id: "shipping", label: "Addresses", group: "My Account" },
  { id: "orders", label: "Your Orders", group: "My Activity" },
  { id: "rmas", label: "RMAs", group: "My Activity" },
];

const createEmptyAddress = () => ({
  label: "Address",
  recipient: "",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
  isDefault: false,
});

const createEmptyPayment = () => ({
  brand: "",
  last4: "",
  expiry: "",
  isDefault: false,
});

const initialPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const currencyFormatter = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 2,
});

const normalizeStatus = (status = "") => status.toLowerCase().replace(/\s+/g, "-");

const SectionLoader = () => (
  <div className="text-center py-5">
    <div className="spinner-border text-primary" role="status" aria-live="polite" />
  </div>
);

const ORDER_FILTERS = [
  { value: "all", label: "All Orders" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Past 3 Months" },
  ...Array.from({ length: 11 }, (_, idx) => {
    const year = 2025 - idx;
    return { value: `y${year}`, label: `${year}` };
  }),
];

const ProfileSection = ({ form, saving, error, onChange, onSubmit, onRefresh }) => (
  <section className="dashboard-section card-saas">
    <p className="text-muted text-uppercase small fw-semibold mb-1">Profile</p>
    <h3 className="mb-1">Basic information</h3>
    <p className="text-muted mb-4">Keep your contact details up to date.</p>
    {error && <p className="text-danger small">{error}</p>}
    <form className="profile-form" onSubmit={onSubmit}>
      <div className="mb-3">
        <label className="form-label" htmlFor="profile-full-name">
          Full name
        </label>
        <input
          id="profile-full-name"
          name="fullName"
          type="text"
          className="form-control"
          value={form.fullName}
          onChange={onChange}
          placeholder="Enter your name"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="profile-email">
          Email
        </label>
        <input
          id="profile-email"
          name="email"
          type="email"
          className="form-control"
          value={form.email}
          onChange={onChange}
          placeholder="you@example.com"
          disabled
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="profile-phone">
          Phone number
        </label>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          className="form-control"
          value={form.phone}
          onChange={onChange}
          placeholder="+65 8123 4455"
        />
      </div>
      <div className="d-flex gap-3 mt-4">
        <button type="submit" className="btn btn-primary-saas px-4" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="btn btn-outline-saas px-4" onClick={onRefresh} disabled={saving}>
          Refresh
        </button>
      </div>
    </form>
  </section>
);

const PasswordSection = ({ form, saving, onChange, onSubmit, onReset }) => (
  <section className="dashboard-section card-saas">
    <p className="text-muted text-uppercase small fw-semibold mb-1">Change Password</p>
    <h3 className="mb-1">Update your credentials</h3>
    <p className="text-muted mb-4">Enter your current password followed by a new one.</p>
    <form className="profile-form" onSubmit={onSubmit}>
      <div className="mb-3">
        <label className="form-label" htmlFor="password-current">
          Current password
        </label>
        <input
          id="password-current"
          name="currentPassword"
          type="password"
          className="form-control"
          value={form.currentPassword}
          onChange={onChange}
          placeholder="Current password"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="password-new">
          New password
        </label>
        <input
          id="password-new"
          name="newPassword"
          type="password"
          className="form-control"
          value={form.newPassword}
          onChange={onChange}
          placeholder="New password"
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="password-confirm">
          Confirm new password
        </label>
        <input
          id="password-confirm"
          name="confirmPassword"
          type="password"
          className="form-control"
          value={form.confirmPassword}
          onChange={onChange}
          placeholder="Re-enter new password"
        />
      </div>
      <div className="d-flex gap-3 mt-4">
        <button type="submit" className="btn btn-primary-saas px-4" disabled={saving}>
          {saving ? "Updating..." : "Update password"}
        </button>
        <button type="button" className="btn btn-outline-saas px-4" onClick={onReset} disabled={saving}>
          Reset
        </button>
      </div>
    </form>
  </section>
);

const PaymentsSection = ({
  payments,
  loading,
  error,
  form,
  editingId,
  saving,
  onChange,
  onSubmit,
  onEdit,
  onDelete,
  onSetDefault,
  onCancelEdit,
}) => {
  const isInitial = payments === null;
  const list = payments || [];
  const [showForm, setShowForm] = React.useState(false);

  const startAdd = () => {
    onCancelEdit();
    setShowForm(true);
  };

  const handleEdit = (method) => {
    onEdit(method);
    setShowForm(true);
  };

  return (
    <section className="dashboard-section card-saas">
      <p className="text-muted text-uppercase small fw-semibold mb-1">Banks & Cards</p>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">Saved payment methods</h3>
        <button className="btn btn-primary-saas btn-sm" onClick={startAdd}>
          Add new card
        </button>
      </div>
      {loading && isInitial ? (
        <SectionLoader />
      ) : (
        <>
          <div className="row g-3">
            {list.map((method) => (
              <div className="col-md-6" key={method.id}>
                <div className="payment-card border rounded p-3 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fw-semibold">{method.brand}</span>
                    {method.isDefault && <span className="badge badge-primary-card">Primary</span>}
                  </div>
                  <p className="mb-0 small text-muted">
                    **** {method.last4} - Expires {method.expiry}
                  </p>
                  <div className="mt-3 d-flex flex-wrap gap-2">
                    <button className="btn btn-outline-saas btn-sm" onClick={() => handleEdit(method)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-outline-saas btn-sm"
                      disabled={method.isDefault}
                      onClick={() => onSetDefault(method)}
                    >
                      Set default
                    </button>
                    <button className="btn btn-outline-saas btn-sm text-danger" onClick={() => onDelete(method.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && <p className="text-muted small mb-0 px-2">No saved payment methods yet.</p>}
          </div>
          {showForm && (
            <div className="mt-4">
              <h5 className="mb-3">{editingId ? "Edit card" : "Add new card"}</h5>
              <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="payment-brand">
                    Brand
                  </label>
                  <input
                    id="payment-brand"
                    name="brand"
                    type="text"
                    className="form-control"
                    value={form.brand}
                    onChange={onChange}
                    placeholder="Visa, MasterCard..."
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="payment-last4">
                    Last 4 digits
                  </label>
                  <input
                    id="payment-last4"
                    name="last4"
                    type="text"
                    className="form-control"
                    value={form.last4}
                    onChange={onChange}
                    placeholder="4242"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="payment-expiry">
                    Expiry
                  </label>
                  <input
                    id="payment-expiry"
                    name="expiry"
                    type="text"
                    className="form-control"
                    value={form.expiry}
                    onChange={onChange}
                    placeholder="MM/YY"
                  />
                </div>
                <div className="col-md-6 d-flex align-items-end">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="payment-default"
                      name="isDefault"
                      checked={form.isDefault}
                      onChange={onChange}
                    />
                    <label className="form-check-label" htmlFor="payment-default">
                      Set as default
                    </label>
                  </div>
                </div>
                <div className="col-12 d-flex gap-3">
                  <button type="submit" className="btn btn-primary-saas" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Update card" : "Save card"}
                  </button>
                  {editingId && (
                    <button type="button" className="btn btn-outline-saas" onClick={onCancelEdit} disabled={saving}>
                      Cancel edit
                    </button>
                  )}
                  <button type="button" className="btn btn-outline-saas" onClick={() => setShowForm(false)} disabled={saving}>
                    Close
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
      {error && <p className="text-danger small mt-3">{error}</p>}
    </section>
  );
};

const AddressesSection = ({
  addresses,
  loading,
  error,
  form,
  editingId,
  saving,
  onChange,
  onSubmit,
  onEdit,
  onDelete,
  onSetDefault,
  onCancelEdit,
}) => {
  const isInitial = addresses === null;
  const list = addresses || [];
  const [showForm, setShowForm] = React.useState(false);

  const startAdd = () => {
    onCancelEdit();
    setShowForm(true);
  };

  const handleEdit = (address) => {
    onEdit(address);
    setShowForm(true);
  };

  return (
    <section className="dashboard-section card-saas">
      <p className="text-muted text-uppercase small fw-semibold mb-1">Shipping Address</p>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0">Shipping Address</h3>
        <button className="btn btn-primary-saas btn-sm" onClick={startAdd}>
          Add new address
        </button>
      </div>
      {loading && isInitial ? (
        <SectionLoader />
      ) : (
        <>
          <div className="row g-3">
            {list.map((address) => (
              <div className="col-md-6" key={address.id}>
                <div className="address-card p-3 rounded border h-100">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong>{address.recipient || "Address"}</strong>
                    {address.isDefault && <span className="badge badge-default">Default</span>}
                  </div>
                  <p className="mb-0 small text-muted">
                    {address.recipient}
                    <br />
                    {address.line1}
                    {address.line2 ? (
                      <>
                        <br />
                        {address.line2}
                      </>
                    ) : null}
                    <br />
                    {address.city} {address.postalCode}
                    <br />
                    {address.country}
                    <br />
                    {address.phone}
                  </p>
                  <div className="mt-3 d-flex flex-wrap gap-2">
                    <button className="btn btn-outline-saas btn-sm" onClick={() => handleEdit(address)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-outline-saas btn-sm"
                      disabled={address.isDefault}
                      onClick={() => onSetDefault(address)}
                    >
                      Set default
                    </button>
                    <button className="btn btn-outline-saas btn-sm text-danger" onClick={() => onDelete(address.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && <p className="text-muted small mb-0 px-2">No saved addresses yet.</p>}
          </div>
          {showForm && (
            <div className="mt-4">
              <h5 className="mb-3">{editingId ? "Edit address" : "Add new address"}</h5>
              <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-12">
                  <label className="form-label" htmlFor="address-recipient">
                    Recipient
                  </label>
                  <input
                    id="address-recipient"
                    name="recipient"
                    type="text"
                    className="form-control"
                    value={form.recipient}
                    onChange={onChange}
                    placeholder="Full name"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="address-line1">
                    Address line 1
                  </label>
                  <input
                    id="address-line1"
                    name="line1"
                    type="text"
                    className="form-control"
                    value={form.line1}
                    onChange={onChange}
                    placeholder="Street, building"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="address-line2">
                    Address line 2
                  </label>
                  <input
                    id="address-line2"
                    name="line2"
                    type="text"
                    className="form-control"
                    value={form.line2}
                    onChange={onChange}
                    placeholder="Unit, floor (optional)"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="address-city">
                    City
                  </label>
                  <input
                    id="address-city"
                    name="city"
                    type="text"
                    className="form-control"
                    value={form.city}
                    onChange={onChange}
                    placeholder="City"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="address-postal">
                    Postal code
                  </label>
                  <input
                    id="address-postal"
                    name="postalCode"
                    type="text"
                    className="form-control"
                    value={form.postalCode}
                    onChange={onChange}
                    placeholder="Postal code"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="address-country">
                    Country
                  </label>
                  <input
                    id="address-country"
                    name="country"
                    type="text"
                    className="form-control"
                    value={form.country}
                    onChange={onChange}
                    placeholder="Country"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="address-phone">
                    Phone
                  </label>
                  <input
                    id="address-phone"
                    name="phone"
                    type="text"
                    className="form-control"
                    value={form.phone}
                    onChange={onChange}
                    placeholder="+65 8123 4455"
                  />
                </div>
                <div className="col-md-6 d-flex align-items-end">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="address-default"
                      name="isDefault"
                      checked={form.isDefault}
                      onChange={onChange}
                    />
                    <label className="form-check-label" htmlFor="address-default">
                      Set as default
                    </label>
                  </div>
                </div>
                <div className="col-12 d-flex gap-3">
                  <button type="submit" className="btn btn-primary-saas" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Update address" : "Save address"}
                  </button>
                  {editingId && (
                    <button type="button" className="btn btn-outline-saas" onClick={onCancelEdit} disabled={saving}>
                      Cancel edit
                    </button>
                  )}
                  <button type="button" className="btn btn-outline-saas" onClick={() => setShowForm(false)} disabled={saving}>
                    Close
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
      {error && <p className="text-danger small mt-3">{error}</p>}
    </section>
  );
};

const OrdersSection = ({ orders, loading, error, nextDelivery, defaultAddress }) => {
  const { list, filter, onFilterChange } = orders;
  const isInitial = list === null;
  const rows = list || [];
  const formattedDefaultAddress = defaultAddress
    ? `${defaultAddress.line1}${defaultAddress.line2 ? ", " + defaultAddress.line2 : ""}, ${defaultAddress.postalCode}`
    : "Shipping Address";

  return (
    <section className="dashboard-section card-saas">
      <p className="text-muted text-uppercase small fw-semibold mb-1">Your Orders</p>
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3 mb-3">
        <div>
          <h3 className="mb-0">Orders ({rows.length})</h3>
          {nextDelivery && (
            <p className="text-muted small mb-0 mt-1">
              Next delivery: <span className="fw-semibold">{nextDelivery.orderId}</span> • {nextDelivery.status}
            </p>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          <label className="form-label text-muted mb-0 small">Filter</label>
          <select
            className="form-select form-select-sm"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            style={{ minWidth: "180px" }}
          >
            {ORDER_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading && isInitial ? (
        <SectionLoader />
      ) : (
        <>
          {rows.map((order) => (
            <div key={order.orderId} className="border rounded p-3 mb-3 order-card">
              <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
              <div className="d-flex flex-wrap gap-4 small text-muted">
                <div>
                  <div className="fw-semibold text-uppercase small">Order placed</div>
                  <div>{new Date(order.date).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="fw-semibold text-uppercase small">Total</div>
                  <div>{currencyFormatter.format(order.total)}</div>
                </div>
                <div>
                  <div className="fw-semibold text-uppercase small">Delivered to</div>
                  <div className="text-primary fw-semibold">{formattedDefaultAddress}</div>
                </div>
              </div>
                <div className="text-end">
                  <div className="small text-muted">Order #{order.orderId}</div>
                  <div className="small">
                    <button className="btn btn-link p-0 me-2">View order details</button>
                    <button className="btn btn-link p-0">Receipt</button>
                  </div>
                </div>
              </div>

              <div className="mt-3 d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-start">
                <div className="flex-grow-1">
                  {order.items.map((item) => (
                    <div key={`${order.orderId}-${item.name}`} className="mb-2">
                      <div className="fw-semibold">{item.name}</div>
                      <div className="small text-muted">
                        Qty {item.qty} • {currencyFormatter.format(item.price)}
                      </div>
                    </div>
                  ))}
                  <div className="small text-muted">
                    Status: <span className={`badge status-badge status-${normalizeStatus(order.status)}`}>{order.status}</span>
                  </div>
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  {(() => {
                    const primaryItem = order.items?.[0];
                    const productHref = primaryItem?.productId ? `/product/${primaryItem.productId}` : "/products";
                    return (
                      <>
                        <a className="btn btn-primary-saas btn-sm" href={productHref}>
                          Buy it again
                        </a>
                        <a className="btn btn-outline-saas btn-sm" href={productHref}>
                          View your item
                        </a>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-muted mb-0 mt-3">No orders in this range. Adjust your filter to see more.</p>
          )}
        </>
      )}
      {error && <p className="text-danger small mt-3">{error}</p>}
    </section>
  );
};

const RmasSection = ({ rmas, loading, error }) => {
  const isInitial = rmas === null;
  const list = rmas || [];

  return (
    <section className="dashboard-section card-saas">
      <p className="text-muted text-uppercase small fw-semibold mb-1">RMAs</p>
      <h3 className="mb-3">Service tickets ({list.length})</h3>
      {loading && isInitial ? (
        <SectionLoader />
      ) : (
        <div className="timeline">
          {list.map((rma) => (
            <div key={rma.rmaId} className="timeline-item">
              <div className="timeline-point" />
              <div className="timeline-content">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-1">{rma.product}</h5>
                  <span className={`badge status-badge status-${normalizeStatus(rma.status)}`}>{rma.status}</span>
                </div>
                <p className="mb-1 text-muted small">{rma.issue}</p>
                <p className="mb-0 small text-muted">
                  Opened {new Date(rma.createdOn).toLocaleDateString()} - Updated{" "}
                  {new Date(rma.lastUpdate).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="text-muted small mb-0">No open RMAs.</p>}
        </div>
      )}
      {error && <p className="text-danger small mt-3">{error}</p>}
    </section>
  );
};

const CustomerDashboard = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const [activeSection, setActiveSection] = useState(DASHBOARD_SECTIONS[0].id);

  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  const [paymentsData, setPaymentsData] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);

  const [shippingData, setShippingData] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState(null);

  const [ordersData, setOrdersData] = useState(null);
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(null);

  const [rmasData, setRmasData] = useState(null);
  const [rmasLoading, setRmasLoading] = useState(false);
  const [rmasError, setRmasError] = useState(null);

  const [profileForm, setProfileForm] = useState({ fullName: "", email: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  const [addressForm, setAddressForm] = useState(createEmptyAddress());
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressSaving, setAddressSaving] = useState(false);

  const [paymentForm, setPaymentForm] = useState(createEmptyPayment());
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const resetAddressForm = useCallback(() => {
    setAddressForm(createEmptyAddress());
    setEditingAddressId(null);
  }, []);

  const resetPaymentForm = useCallback(() => {
    setPaymentForm(createEmptyPayment());
    setEditingPaymentId(null);
  }, []);

  const resetPasswordForm = useCallback(() => {
    setPasswordForm(initialPasswordForm);
  }, []);

  const loadSection = useCallback(
    async (section) => {
      if (!user?.id) {
        setProfileLoading(false);
        setProfileError("You need to sign in to view your dashboard.");
        return;
      }

      const loadProfile = async () => {
        setProfileLoading(true);
        setProfileError(null);
        try {
          const response = await fetchCustomerDashboard(user.id, "profile");
          const data = response.profile || {};
          setProfileData(data);
          setProfileForm({
            fullName: data.fullName || "",
            email: data.email || user?.email || "",
            phone: data.phone || "",
          });

          const resolvedFullName = data.fullName || user?.fullName || user?.email || "";
          const resolvedEmail = data.email || user?.email || "";
          if (!user || user.fullName !== resolvedFullName || user.email !== resolvedEmail) {
            dispatch(
              setUserDetails({
                fullName: resolvedFullName,
                email: resolvedEmail,
              })
            );
          }
          return data;
        } catch (err) {
          setProfileError(err.message || "Unable to load profile");
          throw err;
        } finally {
          setProfileLoading(false);
        }
      };

      const loadPayments = async () => {
        setPaymentsLoading(true);
        setPaymentsError(null);
        try {
          const response = await fetchCustomerDashboard(user.id, "payments");
          setPaymentsData(response.savedPayments || []);
        } catch (err) {
          setPaymentsError(err.message || "Unable to load payment methods");
          throw err;
        } finally {
          setPaymentsLoading(false);
        }
      };

      const loadShipping = async () => {
        setShippingLoading(true);
        setShippingError(null);
        try {
          const response = await fetchCustomerDashboard(user.id, "shipping");
          setShippingData(response.shippingAddresses || []);
        } catch (err) {
          setShippingError(err.message || "Unable to load addresses");
          throw err;
        } finally {
          setShippingLoading(false);
        }
      };

      const loadOrders = async () => {
        setOrdersLoading(true);
        setOrdersError(null);
        try {
          const response = await fetchCustomerDashboard(user.id, "orders");
          setOrdersData(response.purchaseHistory || []);
        } catch (err) {
          setOrdersError(err.message || "Unable to load purchase history");
          throw err;
        } finally {
          setOrdersLoading(false);
        }
      };

      const loadRmas = async () => {
        setRmasLoading(true);
        setRmasError(null);
        try {
          const response = await fetchCustomerDashboard(user.id, "rmas");
          setRmasData(response.rmas || []);
        } catch (err) {
          setRmasError(err.message || "Unable to load RMAs");
          throw err;
        } finally {
          setRmasLoading(false);
        }
      };

      switch (section) {
        case "profile":
          return loadProfile();
        case "payments":
          return loadPayments();
        case "shipping":
          return loadShipping();
        case "orders":
          return loadOrders();
        case "rmas":
          return loadRmas();
        default:
          return null;
      }
    },
    [user, dispatch]
  );

  useEffect(() => {
    loadSection("profile").catch(() => {});
  }, [loadSection]);

  useEffect(() => {
    if (!user?.id) return;
    if (activeSection === "payments" && paymentsData === null && !paymentsLoading) {
      loadSection("payments").catch(() => {});
    } else if (activeSection === "shipping" && shippingData === null && !shippingLoading) {
      loadSection("shipping").catch(() => {});
    } else if (activeSection === "orders" && ordersData === null && !ordersLoading) {
      loadSection("orders").catch(() => {});
    } else if (activeSection === "rmas" && rmasData === null && !rmasLoading) {
      loadSection("rmas").catch(() => {});
    }
  }, [
    activeSection,
    paymentsData,
    paymentsLoading,
    shippingData,
    shippingLoading,
    ordersData,
    ordersLoading,
    rmasData,
    rmasLoading,
    loadSection,
    user,
  ]);

  const profile = profileData || {};
  const savedPayments = paymentsData || [];
  const shippingAddresses = shippingData || [];
  const purchaseHistory = ordersData || [];
  const rmas = rmasData || [];

  const nextDelivery = useMemo(
    () => purchaseHistory.find((order) => order.status && order.status !== "Delivered"),
    [purchaseHistory]
  );

  const groupedSections = useMemo(() => {
    return DASHBOARD_SECTIONS.reduce((groups, section) => {
      const existing = groups.find((item) => item.group === section.group);
      if (existing) {
        existing.items.push(section);
      } else {
        groups.push({ group: section.group, items: [section] });
      }
      return groups;
    }, []);
  }, []);

  const filteredOrders = useMemo(() => {
    if (!ordersData) return [];
    const now = new Date();
    return ordersData.filter((order) => {
      const orderDate = new Date(order.date);
      if (Number.isNaN(orderDate.getTime())) return false;
      if (orderFilter === "all") return true;
      if (orderFilter === "30d") {
        return (now - orderDate) / (1000 * 60 * 60 * 24) <= 30;
      }
      if (orderFilter === "90d") {
        return (now - orderDate) / (1000 * 60 * 60 * 24) <= 90;
      }
      if (orderFilter.startsWith("y")) {
        const year = parseInt(orderFilter.slice(1), 10);
        return orderDate.getFullYear() === year;
      }
      return true;
    });
  }, [ordersData, orderFilter]);

  const isInitialProfileLoading = profileLoading && !profileData;
  if (isInitialProfileLoading) {
    return (
      <div className="container py-5 my-5 text-center">
        <div className="spinner-border text-primary" role="status" aria-live="polite" />
        <p className="mt-3 mb-0 text-muted">Loading...</p>
      </div>
    );
  }

  if (profileError && !profileData) {
    return (
      <div className="container py-5 my-5 text-center">
        <p className="text-danger mb-3">{profileError}</p>
        <p className="text-muted">Please refresh or try again later.</p>
      </div>
    );
  }

  const handleProfileChange = (evt) => {
    const { name, value } = evt.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (evt) => {
    evt.preventDefault();
    if (!user?.id) return;
    setProfileSaving(true);
    try {
      await updateCustomerProfile(user.id, profileForm);
      toast.success("Profile updated");
      await loadSection("profile");
    } catch (err) {
      toast.error(err.message || "Unable to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = (evt) => {
    const { name, value } = evt.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordSubmit = async (evt) => {
    evt.preventDefault();
    if (!user?.id) return;
    setPasswordSaving(true);
    try {
      await changePassword(user.id, passwordForm);
      toast.success("Password updated");
      resetPasswordForm();
    } catch (err) {
      toast.error(err.message || "Unable to update password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleAddressChange = (evt) => {
    const { name, value, type, checked } = evt.target;
    setAddressForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleAddressSubmit = async (evt) => {
    evt.preventDefault();
    if (!user?.id) return;
    setAddressSaving(true);
    try {
      const payload = { ...addressForm, label: addressForm.label || "Address" };
      if (editingAddressId) {
        await updateAddress(user.id, editingAddressId, payload);
        toast.success("Address updated");
      } else {
        await createAddress(user.id, payload);
        toast.success("Address added");
      }
      resetAddressForm();
      await loadSection("shipping");
    } catch (err) {
      toast.error(err.message || "Unable to save address");
    } finally {
      setAddressSaving(false);
    }
  };

  const handleAddressEdit = (address) => {
    setEditingAddressId(address.id);
    setAddressForm({
      label: address.label || "Address",
      recipient: address.recipient || "",
      line1: address.line1 || "",
      line2: address.line2 || "",
      city: address.city || "",
      postalCode: address.postalCode || "",
      country: address.country || "",
      phone: address.phone || "",
      isDefault: Boolean(address.isDefault),
    });
  };

  const handleAddressDelete = async (addressId) => {
    if (!user?.id) return;
    try {
      await deleteAddress(user.id, addressId);
      toast.success("Address removed");
      if (editingAddressId === addressId) {
        resetAddressForm();
      }
      await loadSection("shipping");
    } catch (err) {
      toast.error(err.message || "Unable to delete address");
    }
  };

  const handleAddressSetDefault = async (address) => {
    if (!user?.id || address.isDefault) return;
    try {
      await updateAddress(user.id, address.id, { isDefault: true });
      toast.success("Default address updated");
      await loadSection("shipping");
    } catch (err) {
      toast.error(err.message || "Unable to update default address");
    }
  };

  const handlePaymentChange = (evt) => {
    const { name, value, type, checked } = evt.target;
    setPaymentForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handlePaymentSubmit = async (evt) => {
    evt.preventDefault();
    if (!user?.id) return;
    setPaymentSaving(true);
    try {
      if (editingPaymentId) {
        await updatePaymentMethod(user.id, editingPaymentId, paymentForm);
        toast.success("Card updated");
      } else {
        await createPaymentMethod(user.id, paymentForm);
        toast.success("Card added");
      }
      resetPaymentForm();
      await loadSection("payments");
    } catch (err) {
      toast.error(err.message || "Unable to save payment method");
    } finally {
      setPaymentSaving(false);
    }
  };

  const handlePaymentEdit = (method) => {
    setEditingPaymentId(method.id);
    setPaymentForm({
      brand: method.brand || "",
      last4: method.last4 || "",
      expiry: method.expiry || "",
      isDefault: Boolean(method.isDefault),
    });
  };

  const handlePaymentDelete = async (paymentId) => {
    if (!user?.id) return;
    try {
      await deletePaymentMethod(user.id, paymentId);
      toast.success("Payment method removed");
      if (editingPaymentId === paymentId) {
        resetPaymentForm();
      }
      await loadSection("payments");
    } catch (err) {
      toast.error(err.message || "Unable to delete payment method");
    }
  };

  const handlePaymentSetDefault = async (method) => {
    if (!user?.id || method.isDefault) return;
    try {
      await updatePaymentMethod(user.id, method.id, { isDefault: true });
      toast.success("Default card updated");
      await loadSection("payments");
    } catch (err) {
      toast.error(err.message || "Unable to update default card");
    }
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case "profile":
        return (
          <ProfileSection
            form={profileForm}
            saving={profileSaving}
            error={profileError}
            onChange={handleProfileChange}
            onSubmit={handleProfileSubmit}
            onRefresh={() => loadSection("profile").catch(() => {})}
          />
        );
      case "password":
        return (
          <PasswordSection
            form={passwordForm}
            saving={passwordSaving}
            onChange={handlePasswordChange}
            onSubmit={handlePasswordSubmit}
            onReset={resetPasswordForm}
          />
        );
      case "payments":
        return (
          <PaymentsSection
            payments={paymentsData}
            loading={paymentsLoading}
            error={paymentsError}
            form={paymentForm}
            editingId={editingPaymentId}
            saving={paymentSaving}
            onChange={handlePaymentChange}
            onSubmit={handlePaymentSubmit}
            onEdit={handlePaymentEdit}
            onDelete={handlePaymentDelete}
            onSetDefault={handlePaymentSetDefault}
            onCancelEdit={resetPaymentForm}
          />
        );
      case "shipping":
        return (
          <AddressesSection
            addresses={shippingData}
            loading={shippingLoading}
            error={shippingError}
            form={addressForm}
            editingId={editingAddressId}
            saving={addressSaving}
            onChange={handleAddressChange}
            onSubmit={handleAddressSubmit}
            onEdit={handleAddressEdit}
            onDelete={handleAddressDelete}
            onSetDefault={handleAddressSetDefault}
            onCancelEdit={resetAddressForm}
          />
        );
      case "orders":
        return (
          <OrdersSection
            orders={{ list: filteredOrders, filter: orderFilter, onFilterChange: setOrderFilter }}
            loading={ordersLoading}
            error={ordersError}
            nextDelivery={nextDelivery}
            defaultAddress={shippingAddresses.find((a) => a.isDefault) || shippingAddresses[0]}
          />
        );
      case "rmas":
        return <RmasSection rmas={rmasData} loading={rmasLoading} error={rmasError} />;
      default:
        return null;
    }
  };

  const displayName = profile.fullName?.trim() || user?.fullName || user?.email || "Customer";
  const displayEmail = profile.email || user?.email || "";
  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // ignore server logout errors; still clear client session
    } finally {
      dispatch(logout());
    }
  };

  return (
    <div className="container py-5 dashboard-container">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar card-saas">
          <div className="sidebar-identity mb-4">
            <p className="text-muted text-uppercase small fw-semibold mb-1">Account Owner</p>
            <h4 className="mb-0">{displayName}</h4>
            {displayEmail && <p className="text-muted mb-0">{displayEmail}</p>}
          </div>
          <div className="sidebar-divider" />

          {groupedSections.map(({ group, items }) => (
            <div className="sidebar-group" key={group}>
              <p className="text-muted text-uppercase small fw-semibold mb-2">{group}</p>
              <nav className="dashboard-nav">
                {items.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`sidebar-link ${activeSection === section.id ? "active" : ""}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
          ))}
          <button className="btn btn-outline-saas mt-4 w-100" onClick={handleLogout}>
            Log out
          </button>
        </aside>

        <main className="dashboard-content">{renderActiveSection()}</main>
      </div>
    </div>
  );
};

export default CustomerDashboard;
