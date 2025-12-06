import { requestSupport } from "./client";

const unwrap = (promise) => promise.then((res) => res.data);

export const fetchSupportSessions = (status) =>
  unwrap(requestSupport(`/sessions${status ? `?status=${encodeURIComponent(status)}` : ""}`));

export const fetchSessionDetail = (sessionId) =>
  unwrap(requestSupport(`/sessions/${sessionId}`));

export const claimSession = (sessionId, agentId) =>
  unwrap(requestSupport(`/sessions/${sessionId}/claim`, {
    method: "POST",
    body: { agent_id: agentId },
  }));

export const sendAgentMessage = (sessionId, agentId, message) =>
  unwrap(requestSupport(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: { agent_id: agentId, message },
  }));

export const resolveSession = (sessionId, agentId, resolutionTag = "") =>
  unwrap(requestSupport(`/sessions/${sessionId}/resolve`, {
    method: "POST",
    body: { agent_id: agentId, resolution_tag: resolutionTag },
  }));

export const submitCsat = (sessionId, rating, feedback) =>
  unwrap(requestSupport(`/sessions/${sessionId}/csat`, {
    method: "POST",
    body: { rating, feedback },
  }));

export const fetchCsatSummary = (windowDays = 30, agentId) =>
  unwrap(requestSupport(`/csat/summary?window_days=${windowDays}${agentId ? `&agent_id=${agentId}` : ""}`));

export const fetchCsatResponses = (limit = 50) =>
  unwrap(requestSupport(`/csat/responses?limit=${limit}`));

export const fetchAgentProfile = () => unwrap(requestSupport(`/profile`));

export const updateAgentProfile = (body) =>
  unwrap(requestSupport(`/profile`, { method: "PUT", body }));
