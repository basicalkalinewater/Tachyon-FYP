import { request } from "./client";

export const fetchFaqs = () => request("/content/faqs");

export const fetchPolicies = () => request("/content/policies");
