import { request } from "./client";

export const fetchFaqs = () => request("/content/faqs");

export const searchFaqs = (q) =>
  request(`/content/faqs/search?q=${encodeURIComponent(q || "")}`);

export const fetchPolicies = () => request("/content/policies");

export const fetchAnnouncement = () => request("/content/announcement");
