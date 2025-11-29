import React from "react";

const Accessibility = () => {
  return (
    <div className="container py-5">
      <h2 className="mb-4">Accessibility Statement</h2>
      <p className="text-muted">
        We’re committed to making our site usable by everyone. If you experience issues, please let us know so we can improve.
      </p>
      <ul className="text-muted">
        <li>We follow best practices for semantic HTML, keyboard navigation, and color contrast.</li>
        <li>We aim to provide alt text for meaningful images and labels for form fields.</li>
        <li>If you need assistance or alternative formats, contact our support team.</li>
        <li>We review accessibility on an ongoing basis and welcome your feedback.</li>
      </ul>
    </div>
  );
};

export default Accessibility;
