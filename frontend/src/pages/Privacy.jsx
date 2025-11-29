import React from "react";

const Privacy = () => {
  return (
    <div className="container py-5">
      <h2 className="mb-4">Privacy Policy</h2>
      <p className="text-muted">
        We respect your privacy. This summary covers how we collect, use, and protect your information.
      </p>
      <ul className="text-muted">
        <li>We collect data you provide (e.g., account info, orders) and technical data (e.g., device/browser).</li>
        <li>We use your data to process orders, provide customer support, and improve our services.</li>
        <li>We do not sell your personal information. We share with trusted service providers for payments, shipping, and analytics.</li>
        <li>You can request access, correction, or deletion of your data by contacting support.</li>
        <li>We use encryption, access controls, and best practices to protect your data.</li>
      </ul>
    </div>
  );
};

export default Privacy;
