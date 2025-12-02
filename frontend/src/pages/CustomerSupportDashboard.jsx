import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logout, selectCurrentUser } from "../redux/authSlice";
import { toast } from "react-hot-toast";

import "../styles/dashboard.css"; // reuse the SAME dashboard styling

// Support dashboard sections
const SUPPORT_SECTIONS = [
  { id: "inbox",    label: "Incoming Chats",  group: "Chat Management" },
  { id: "assigned", label: "My Active Chats", group: "Chat Management" },
  { id: "history",  label: "Chat History",    group: "Chat Management" },
  { id: "profile",  label: "My Profile",      group: "Account" },
];

// Group sections by their `group` name (NO hooks here)
const GROUPED_SUPPORT_SECTIONS = SUPPORT_SECTIONS.reduce((groups, section) => {
  const existing = groups.find((g) => g.group === section.group);
  if (existing) {
    existing.items.push(section);
  } else {
    groups.push({ group: section.group, items: [section] });
  }
  return groups;
}, []);

const CustomerSupportDashboard = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);

  const [activeSection, setActiveSection] = useState("inbox");

  const handleLogout = () => {
    dispatch(logout());
    toast.success("Logged out successfully");
  };

  const displayEmail = user?.email || "";
  const displayName =
    (user?.fullName && user.fullName.trim()) ||
    displayEmail ||
    "Support Agent";

  // Placeholder renderers — later you’ll replace with real components
  const renderSection = () => {
    switch (activeSection) {
      case "inbox":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Incoming Chats
            </p>
            <h3 className="mb-3">Escalated Chats Queue</h3>
            <p className="text-muted">List of customers waiting for support.</p>
            {/* TODO: Put your incoming chats list here */}
          </section>
        );
      case "assigned":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              My Active Chats
            </p>
            <h3 className="mb-3">Chats Assigned To You</h3>
            <p className="text-muted">Your ongoing conversations.</p>
            {/* TODO: Active chats UI */}
          </section>
        );
      case "history":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Chat History
            </p>
            <h3 className="mb-3">Completed Chats</h3>
            <p className="text-muted">Search and review older chats.</p>
            {/* TODO: Chat history table */}
          </section>
        );
      case "profile":
        return (
          <section className="dashboard-section card-saas">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              My Profile
            </p>
            <h3 className="mb-3">Support Agent Details</h3>
            <p className="text-muted">This is a read-only section for now.</p>
            <p>
              <strong>Name:</strong> {displayName}
            </p>
            <p>
              <strong>Email:</strong> {displayEmail}
            </p>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container py-5 dashboard-container">
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="dashboard-sidebar card-saas">
          <div className="mb-4">
            <p className="text-muted text-uppercase small fw-semibold mb-1">
              Support Agent
            </p>
            <h4 className="mb-0">{displayName}</h4>
            <p className="text-muted mb-0">{displayEmail}</p>
          </div>

          {GROUPED_SUPPORT_SECTIONS.map(({ group, items }) => (
            <div className="sidebar-group" key={group}>
              <p className="text-muted text-uppercase small fw-semibold mb-2">
                {group}
              </p>
              <nav className="dashboard-nav">
                {items.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`sidebar-link ${
                      activeSection === section.id ? "active" : ""
                    }`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
          ))}

          <button
            className="btn btn-outline-saas mt-4 w-100"
            onClick={handleLogout}
          >
            Log out
          </button>
        </aside>

        {/* Main content */}
        <main className="dashboard-content">{renderSection()}</main>
      </div>
    </div>
  );
};

export default CustomerSupportDashboard;
