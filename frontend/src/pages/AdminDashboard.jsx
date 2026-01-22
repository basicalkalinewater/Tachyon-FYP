import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { fetchCsatSummary, fetchCsatResponses } from "../api/support";
import { fetchAdminProfile, updateAdminProfile } from "../api/auth";
import { listAdminUsers, createAdminUser, updateAdminUser, disableAdminUser, fetchAdminInsights } from "../api/admin";
import { toast } from "react-hot-toast";
import "../styles/admin-dashboard.css";

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Overview", group: "Command Center" },
  { id: "products", label: "Products", group: "Management" },
  { id: "users", label: "Users", group: "Management" },
  { id: "management", label: "Management", group: "Management" },
  { id: "profile", label: "My Profile", group: "Account" },
];

const GROUPED_ADMIN_SECTIONS = ADMIN_SECTIONS.reduce((groups, section) => {
  const existing = groups.find((g) => g.group === section.group);
  if (existing) {
    existing.items.push(section);
  } else {
    groups.push({ group: section.group, items: [section] });
  }
  return groups;
}, []);

const AdminDashboard = () => {
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [insights, setInsights] = useState({ bestMonth: null, worstMonth: null, totalSalesToday: 0, ordersToday: 0 });
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [viewMode, setViewMode] = useState("dashboard"); // dashboard | profile | users | management
  const [managementTab, setManagementTab] = useState("faqs"); // faqs | policies
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
  const displayName = currentUser?.fullName || currentUser?.email || "Admin";
  const displayEmail = currentUser?.email || "";
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, responses, insightsRes] = await Promise.all([
        fetchCsatSummary(120),
        fetchCsatResponses(20),
        fetchAdminInsights(),
      ]);
      setCsat({
        summary: summaryData.summary || {},
        trend: summaryData.trend || [],
        verbatim: responses || [],
      });
      const insightsData = insightsRes?.data || insightsRes || {};
      setInsights({
        bestMonth: insightsData.best_selling_product_month || null,
        worstMonth: insightsData.worst_selling_product_month || null,
        totalSalesToday: insightsData.total_sales_today || 0,
        ordersToday: insightsData.orders_today || 0,
      });
    } catch (err) {
      toast.error(err.message || "Failed to load admin metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetchAdminProfile();
      setProfile({
        full_name: res.data?.full_name || "",
        phone: res.data?.phone || "",
      });
    } catch (err) {
      toast.error(err.message || "Failed to load profile");
    }
  }, []);

  useEffect(() => {
    load();
    loadProfile();
  }, [load, loadProfile]);

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
      const list = data.data || data || [];
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
    setEditUserForm(null);
    setShowCreateForm(true);
    setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "" });
  };

  const startEditUser = (u) => {
    setShowCreateForm(false);
    setEditUserForm({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status || "active",
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
        status: editUserForm.status,
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

  const handleDisableUser = async (userId, email) => {
    const confirm = window.confirm(`Disable user ${email}? This revokes all sessions and sets status to disabled.`);
    if (!confirm) return;
    try {
      await disableAdminUser(userId);
      toast.success("User disabled (sessions revoked)");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Unable to disable user");
    }
  };

  const handleEnableUser = async (userId, email) => {
    const confirm = window.confirm(`Re-enable ${email}?`);
    if (!confirm) return;
    try {
      await updateAdminUser(userId, { status: "active" });
      toast.success("User enabled");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Unable to enable user");
    }
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

  // Helper Render functions
  const renderDashboard = () => (
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
        <div className="admin-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Business insights</p>
              <h4>Sales performance</h4>
            </div>
          </div>
          <ul className="insight-list">
            <li>
              <p className="muted tiny mb-1">Best-selling product (month)</p>
              <div className="insight-value">
                <strong>{insights.bestMonth?.name || "N/A"}</strong>
                <span className="muted tiny">{insights.bestMonth ? `${insights.bestMonth.quantity} sold` : "No sales yet"}</span>
              </div>
            </li>
            <li>
              <p className="muted tiny mb-1">Worst-selling product (month)</p>
              <div className="insight-value">
                <strong>{insights.worstMonth?.name || "N/A"}</strong>
                <span className="muted tiny">{insights.worstMonth ? `${insights.worstMonth.quantity} sold` : "No sales yet"}</span>
              </div>
            </li>
            <li>
              <p className="muted tiny mb-1">Total sales today</p>
              <div className="insight-value">
                <strong>{currencyFormatter.format(insights.totalSalesToday || 0)}</strong>
                <span className="muted tiny">{insights.ordersToday} orders today</span>
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
  );

  const renderProfile = () => (
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
              placeholder="+65 1234 5678"
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
  );

  const renderManagement = () => (
    <section className="admin-grid">
      <div className="admin-card wide">
        <div className="card-header">
          <div>
            <p className="eyebrow">Management</p>
            <h4>Tools & settings</h4>
          </div>
        </div>
        <div className="d-flex gap-2 mb-3">
          <button
            type="button"
            className={`btn ${managementTab === "faqs" ? "btn-primary-saas" : "btn-outline-saas"}`}
            onClick={() => setManagementTab("faqs")}
          >
            FAQs
          </button>
          <button
            type="button"
            className={`btn ${managementTab === "policies" ? "btn-primary-saas" : "btn-outline-saas"}`}
            onClick={() => setManagementTab("policies")}
          >
            Policies
          </button>
        </div>
        {managementTab === "faqs" && <p className="muted mb-0">FAQ management panel placeholder.</p>}
        {managementTab === "policies" && <p className="muted mb-0">Policy management panel placeholder.</p>}
      </div>
    </section>
  );

  const renderUsers = () => (
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
                        {u.status === "disabled" ? (
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleEnableUser(u.id, u.email)}
                            title="Enable user"
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleDisableUser(u.id, u.email)}
                            title="Revoke sessions / disable"
                          >
                            Disable
                          </button>
                        )}
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
                placeholder="+65 1234 5678"
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
                placeholder="+65 1234 5678"
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
  );

  // MAIN RETURN
  return (
    <div className="admin-dashboard-page">
      <div className="admin-shell">
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="sidebar-identity">
              <p className="eyebrow sidebar-label">Admin</p>
              <h3 className="sidebar-name">{displayName}</h3>
              <p className="muted-email">{displayEmail}</p>
            </div>

            <div className="sidebar-divider" />
            {GROUPED_ADMIN_SECTIONS.map(({ group, items }) => (
              <div className="sidebar-group" key={group}>
                <p className="muted tiny sidebar-label">{group}</p>
                <nav className="admin-nav">
                  {items.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`sidebar-link ${viewMode === section.id ? "active" : ""}`}
                      onClick={() => setViewMode(section.id)}
                      aria-pressed={viewMode === section.id}
                    >
                      {section.label}
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </aside>

          <main className="admin-main">
            <section className="admin-hero">
              <div>
                <p className="eyebrow">Tachyon Command Center</p>
                <h1>
                  Welcome{currentUser?.fullName ? `, ${currentUser.fullName}` : ""}{" "}
                  <span className="hero-chip">Last 30 days</span>
                </h1>
                <p className="muted">
                  Monitor CSAT, spot risky trends, and review verbatim feedback.
                </p>
                <div className="hero-actions">
                  {viewMode === "dashboard" && (
                    <button className="pill-btn" onClick={load} disabled={loading}>
                      {loading ? "Refreshing..." : "Refresh data"}
                    </button>
                  )}
                  {viewMode !== "dashboard" && (
                    <button className="pill-btn ghost" type="button" onClick={() => setViewMode("dashboard")}>
                      Back to overview
                    </button>
                  )}
                </div>
              </div>
              <div className="hero-meta">
                <span className="muted tiny">Average trend</span>
                <div className="hero-score">{averageTrend || 0}%</div>
                <p className="muted tiny mb-0">CSAT across recorded days</p>
              </div>
            </section>

            {viewMode === "dashboard" && renderDashboard()}
            {viewMode === "profile" && renderProfile()}
            {viewMode === "users" && renderUsers()}
            {viewMode === "management" && renderManagement()}
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;