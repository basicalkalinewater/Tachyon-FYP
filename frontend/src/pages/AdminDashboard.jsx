import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { fetchCsatSummary, fetchCsatResponses } from "../api/support";
import { fetchAdminProfile, updateAdminProfile } from "../api/auth";
import { listAdminUsers, createAdminUser, updateAdminUser, disableAdminUser } from "../api/admin";
import { toast } from "react-hot-toast";
import "../styles/admin-dashboard.css";

const AdminDashboard = () => {
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [viewMode, setViewMode] = useState("dashboard"); // dashboard | profile | users
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userFilters, setUserFilters] = useState({ email: "", role: "" });
  const [userForm, setUserForm] = useState({
    id: null,
    email: "",
    role: "customer",
    full_name: "",
    phone: "",
    password: "",
  });
  const [userSaving, setUserSaving] = useState(false);
  const [editUserForm, setEditUserForm] = useState(null);
  const [editUserSaving, setEditUserSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const currentUser = useSelector((state) => state.auth.user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summaryData = await fetchCsatSummary(30);
      const responses = await fetchCsatResponses(20);
      setCsat({
        summary: summaryData.summary || {},
        trend: summaryData.trend || [],
        verbatim: responses || [],
      });
    } catch (err) {
      toast.error(err.message || "Failed to load admin metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadProfile();
  }, [load]);

  const loadProfile = async () => {
    try {
      const res = await fetchAdminProfile();
      setProfile({
        full_name: res.data?.full_name || "",
        phone: res.data?.phone || "",
      });
    } catch (err) {
      toast.error(err.message || "Failed to load profile");
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateAdminProfile({
        full_name: profile.full_name,
        phone: profile.phone
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await listAdminUsers({
        email: userFilters.email,
        role: userFilters.role,
        limit: 50,
        offset: 0,
      });
      // API returns {success,data}; handle both patterns
      const list = data.data || data || [];
      // Exclude admins from the grid (self/other admins managed via profile)
      setUsers(list.filter((u) => u.role !== "admin"));
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [userFilters]);

  useEffect(() => {
    if (viewMode === "users") {
      loadUsers();
    }
  }, [viewMode, loadUsers]);

  const startCreateUser = () => {
    setEditUserForm(null); // hide edit while creating
    setShowCreateForm(true);
    setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "" });
  };

  const startEditUser = (u) => {
    setShowCreateForm(false); // hide create while editing
    setEditUserForm({
      id: u.id,
      email: u.email,
      role: u.role,
      full_name: u.full_name || "",
      phone: u.phone || "",
      password: "",
      shippingAddresses: u.shippingAddresses || [],
    });
  };

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUserSave = async (e) => {
    e.preventDefault();
    setUserSaving(true);
    try {
      await createAdminUser({
        email: userForm.email,
        role: userForm.role,
        password: userForm.password,
        full_name: userForm.full_name,
        phone: userForm.phone,
      });
      toast.success("User created");
      await loadUsers();
      setShowCreateForm(false);
      setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "" });
    } catch (err) {
      toast.error(err.message || "Failed to save user");
    } finally {
      setUserSaving(false);
    }
  };

  const handleEditUserSave = async (e) => {
    e.preventDefault();
    if (!editUserForm) return;
    setEditUserSaving(true);
    try {
      await updateAdminUser(editUserForm.id, {
        role: editUserForm.role,
        full_name: editUserForm.full_name,
        phone: editUserForm.phone,
        password: editUserForm.password || undefined,
      });
      toast.success("User updated");
      await loadUsers();
      setEditUserForm(null);
    } catch (err) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setEditUserSaving(false);
    }
  };

  const handleDisableUser = async (userId) => {
    toast.error("Disable action is not available (no status column). Remove sessions manually if needed.");
  };

  const summary = csat.summary || {};
  const trend = csat.trend || [];

  const bestTrendPoint = useMemo(() => {
    if (!trend.length) return null;
    return trend.reduce((best, point) => {
      const value = Number(point.csat_pct ?? 0);
      const bestValue = Number(best.csat_pct ?? 0);
      return value > bestValue ? point : best;
    }, trend[0]);
  }, [trend]);

  const averageTrend = useMemo(() => {
    if (!trend.length) return 0;
    const total = trend.reduce((sum, p) => sum + Number(p.csat_pct ?? 0), 0);
    return Math.round(total / trend.length);
  }, [trend]);

  return (
    <div className="admin-dashboard-page">
      <div className="admin-shell">
        <section className="admin-hero">
          <div>
            <p className="eyebrow">Tachyon Command Center</p>
            <h1>
              Welcome{currentUser?.fullName ? `, ${currentUser.fullName}` : ""}{" "}
              <span className="hero-chip">Last 30 days</span>
            </h1>
            <p className="muted">
              Monitor CSAT, spot risky trends, and review verbatim feedback across every channel.
            </p>
            <div className="hero-actions">
              <button className="pill-btn" onClick={load} disabled={loading} hidden={viewMode !== "dashboard"}>
                {loading ? "Refreshing..." : "Refresh data"}
              </button>
              <div className="btn-group">
                {viewMode !== "dashboard" && (
                  <button
                    className="pill-btn ghost"
                    type="button"
                    onClick={() => setViewMode("dashboard")}
                  >
                    ← Back
                  </button>
                )}
                <button
                  className={`pill-btn ghost ${viewMode === "users" ? "active" : ""}`}
                  type="button"
                  onClick={() => setViewMode("users")}
                >
                  Users
                </button>
                <button
                  className={`pill-btn ghost ${viewMode === "profile" ? "active" : ""}`}
                  type="button"
                  onClick={() => setViewMode("profile")}
                >
                  Edit profile
                </button>
              </div>
            </div>
          </div>
          <div className="hero-meta">
            <span className="muted tiny">Average trend</span>
            <div className="hero-score">{averageTrend || 0}%</div>
            <p className="muted tiny mb-0">CSAT across recorded days</p>
          </div>
        </section>

        {viewMode === "dashboard" && (
          <>
            <section className="admin-metric-grid">
              <div className="admin-card metric">
                <p className="muted">CSAT %</p>
                <div className="metric-value">{Math.round(summary.csat_pct ?? 0)}%</div>
                <span className="muted small">Overall satisfaction</span>
              </div>
              <div className="admin-card metric">
                <p className="muted">Avg Rating</p>
                <div className="metric-value">{Number(summary.avg_rating ?? 0).toFixed(2)}</div>
                <span className="muted small">5-point scale</span>
              </div>
              <div className="admin-card metric">
                <p className="muted">Responses</p>
                <div className="metric-value">{summary.responses ?? 0}</div>
                <span className="muted small">Collected in the window</span>
              </div>
              <div className="admin-card metric">
                <p className="muted">Peak day</p>
                <div className="metric-value">
                  {bestTrendPoint?.csat_pct ? `${Math.round(bestTrendPoint.csat_pct)}%` : "—"}
                </div>
                <span className="muted small">
                  {bestTrendPoint?.day
                    ? new Date(bestTrendPoint.day).toLocaleDateString()
                    : "Best recorded CSAT"}
                </span>
              </div>
            </section>

            <section className="admin-grid">
              <div className="admin-card trend">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Signal</p>
                    <h4>CSAT trajectory</h4>
                  </div>
                  <span className="muted small">{trend.length ? `${trend.length} days` : "No data"}</span>
                </div>
                {trend.length ? (
                  <div className="trend-bars">
                    {trend.slice(-20).map((point, idx) => {
                      const value = Math.max(0, Math.min(100, Number(point.csat_pct ?? 0)));
                      return (
                        <div className="trend-bar" key={`${point.day || idx}-${idx}`}>
                          <div
                            className="trend-bar-fill"
                            style={{ height: `${Math.max(10, value * 0.9)}%` }}
                            title={`${value}% CSAT`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted small mb-0">Trend data will appear after customer ratings arrive.</p>
                )}
              </div>

              <div className="admin-card insights">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">At a glance</p>
                    <h4>Quality insights</h4>
                  </div>
                </div>
                <ul className="insight-list">
                  <li>
                    <p className="muted tiny mb-1">Current health</p>
                    <div className="insight-value">
                      <span className="badge soft">{Math.round(summary.csat_pct ?? 0)}% CSAT</span>
                      <span className="muted tiny">steady vs avg {averageTrend}%</span>
                    </div>
                  </li>
                  <li>
                    <p className="muted tiny mb-1">Volume</p>
                    <div className="insight-value">
                      <strong>{summary.responses ?? 0}</strong>
                      <span className="muted tiny">responses captured</span>
                    </div>
                  </li>
                  <li>
                    <p className="muted tiny mb-1">Best day</p>
                    <div className="insight-value">
                      {bestTrendPoint?.day ? new Date(bestTrendPoint.day).toLocaleDateString() : "TBC"}
                      <span className="muted tiny">
                        {bestTrendPoint?.csat_pct ? `${Math.round(bestTrendPoint.csat_pct)}%` : "Awaiting data"}
                      </span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="admin-card wide">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Voice of customer</p>
                    <h4>Latest feedback</h4>
                  </div>
                </div>
                {loading ? (
                  <p className="muted small mb-0">Loading...</p>
                ) : csat.verbatim && csat.verbatim.length ? (
                  <ul className="feedback-list">
                    {csat.verbatim.map((v) => (
                      <li key={v.session_id}>
                        <div className="feedback-top">
                          <div className="badge">Rating {v.customer_rating}/5</div>
                          <span className="muted tiny">
                            {v.customer_rating_submitted_at
                              ? new Date(v.customer_rating_submitted_at).toLocaleString()
                              : ""}
                          </span>
                        </div>
                        <p className="muted tiny mb-1">
                          {v.customer_name || "Unknown customer"} ({v.customer_email || "N/A"})
                        </p>
                        {v.customer_feedback && <div className="feedback-text">{v.customer_feedback}</div>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small mb-0">No feedback yet.</p>
                )}
              </div>
            </section>
          </>
        )}

        {viewMode === "profile" && (
          <section className="admin-grid">
            <div className="admin-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Profile</p>
                  <h4>Admin details</h4>
                </div>
              </div>
              <form className="profile-form" onSubmit={handleProfileSave}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="admin-full-name">Full name</label>
                  <input
                    id="admin-full-name"
                    name="full_name"
                    type="text"
                    className="form-control"
                    value={profile.full_name}
                    onChange={handleProfileChange}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="admin-email">Email</label>
                  <input
                    id="admin-email"
                    type="email"
                    className="form-control"
                    value={currentUser?.email || ""}
                    disabled
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="admin-phone">Phone</label>
                  <input
                    id="admin-phone"
                    name="phone"
                    type="tel"
                    className="form-control"
                    value={profile.phone}
                    onChange={handleProfileChange}
                    placeholder="+1 555 123 4567"
                  />
                </div>
                <div className="d-flex gap-3 mt-3">
                  <button type="submit" className="btn btn-primary-saas" disabled={profileSaving}>
                    {profileSaving ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className="btn btn-outline-saas" onClick={loadProfile} disabled={profileSaving}>
                    Refresh
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {viewMode === "users" && (
          <section className="admin-grid users-grid">
            <div className="admin-card wide">
              <div className="card-header">
                <div>
                  <p className="eyebrow">User management</p>
                  <h4>Search & manage users</h4>
                </div>
              </div>
              <div className="d-flex gap-3 flex-wrap mb-3 align-items-center">
                <input
                  type="search"
                  className="form-control"
                  style={{ maxWidth: 220 }}
                  placeholder="Email contains"
                  value={userFilters.email}
                  onChange={(e) => setUserFilters((p) => ({ ...p, email: e.target.value }))}
                />
                <select
                  className="form-select"
                  style={{ maxWidth: 160 }}
                  value={userFilters.role}
                  onChange={(e) => setUserFilters((p) => ({ ...p, role: e.target.value }))}
                >
                  <option value="">All roles</option>
                  <option value="customer">Customer</option>
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="btn btn-outline-saas" onClick={loadUsers} disabled={usersLoading}>
                  {usersLoading ? "Loading..." : "Apply"}
                </button>
                <button
                  className="btn btn-primary-saas"
                  type="button"
                  onClick={startCreateUser}
                  disabled={usersLoading}
                >
                  New user
                </button>
              </div>

              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading ? (
                      <tr>
                        <td colSpan="5" className="text-muted">Loading users...</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-muted">No users found.</td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.email}</td>
                          <td>{u.full_name || "—"}</td>
                          <td className="text-capitalize">{u.role}</td>
                          <td>{u.phone || "—"}</td>
                          <td className="text-end">
                            <div className="d-flex gap-2 justify-content-end">
                              <button className="btn btn-outline-saas btn-sm" onClick={() => startEditUser(u)}>
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {showCreateForm && (
              <div className="admin-card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Create user</p>
                    <h4>New account</h4>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-saas btn-sm"
                    onClick={() => setShowCreateForm(false)}
                    disabled={userSaving}
                  >
                    Close
                  </button>
                </div>
                <form className="profile-form" onSubmit={handleUserSave}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-email">Email</label>
                    <input
                      id="um-email"
                      name="email"
                      type="email"
                      className="form-control"
                      value={userForm.email}
                      onChange={handleUserChange}
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-role">Role</label>
                    <select
                      id="um-role"
                      name="role"
                      className="form-select"
                      value={userForm.role}
                      onChange={handleUserChange}
                      required
                    >
                      <option value="customer">Customer</option>
                      <option value="support">Support</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-full-name">Full name</label>
                    <input
                      id="um-full-name"
                      name="full_name"
                      type="text"
                      className="form-control"
                      value={userForm.full_name}
                      onChange={handleUserChange}
                      placeholder="Name"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-phone">Phone</label>
                    <input
                      id="um-phone"
                      name="phone"
                      type="tel"
                      className="form-control"
                      value={userForm.phone}
                      onChange={handleUserChange}
                      placeholder="+1 555 123 4567"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-password">Password</label>
                    <input
                      id="um-password"
                      name="password"
                      type="password"
                      className="form-control"
                      value={userForm.password}
                      onChange={handleUserChange}
                      placeholder="Set an initial password"
                      required
                    />
                  </div>
                  <div className="d-flex gap-3 mt-3">
                    <button type="submit" className="btn btn-primary-saas" disabled={userSaving}>
                      {userSaving ? "Saving..." : "Save user"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-saas"
                      onClick={startCreateUser}
                      disabled={userSaving}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>
            )}

            {editUserForm && (
              <div className="admin-card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Edit user</p>
                    <h4>{editUserForm.email}</h4>
                  </div>
                </div>
                <form className="profile-form" onSubmit={handleEditUserSave}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-edit-email">Email</label>
                    <input
                      id="um-edit-email"
                      type="email"
                      className="form-control"
                      value={editUserForm.email}
                      disabled
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-edit-role">Role</label>
                    <select
                      id="um-edit-role"
                      name="role"
                      className="form-select"
                      value={editUserForm.role}
                      onChange={(e) => setEditUserForm((p) => ({ ...p, role: e.target.value }))}
                      required
                    >
                      <option value="customer">Customer</option>
                      <option value="support">Support</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-edit-full-name">Full name</label>
                    <input
                      id="um-edit-full-name"
                      name="full_name"
                      type="text"
                      className="form-control"
                      value={editUserForm.full_name}
                      onChange={(e) => setEditUserForm((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="Name"
                    />
                  </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="um-edit-phone">Phone</label>
                  <input
                    id="um-edit-phone"
                    name="phone"
                      type="tel"
                      className="form-control"
                      value={editUserForm.phone || ""}
                      onChange={(e) => setEditUserForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+1 555 123 4567"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="um-edit-password">Reset password</label>
                    <input
                      id="um-edit-password"
                      name="password"
                      type="password"
                      className="form-control"
                      value={editUserForm.password || ""}
                      onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  {editUserForm.role === "customer" && (
                    <div className="mb-3">
                      <label className="form-label">Shipping addresses</label>
                      {editUserForm.shippingAddresses && editUserForm.shippingAddresses.length > 0 ? (
                        <ul className="list-unstyled mb-0">
                          {editUserForm.shippingAddresses.map((addr) => (
                            <li key={addr.id || addr.label} className="mb-2">
                              <strong>{addr.label || "Address"}</strong>{" "}
                              {addr.is_default ? <span className="badge">Default</span> : null}
                              <div className="muted small">
                                {addr.recipient} · {addr.line1}
                                {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.country} {addr.postalCode || addr.postal_code || ""}
                              </div>
                              {addr.phone && <div className="muted small">Phone: {addr.phone}</div>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted small mb-0">No shipping addresses on file.</p>
                      )}
                    </div>
                  )}
                  <div className="d-flex gap-3 mt-3">
                    <button type="submit" className="btn btn-primary-saas" disabled={editUserSaving}>
                      {editUserSaving ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-saas"
                      onClick={() => setEditUserForm(null)}
                      disabled={editUserSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
