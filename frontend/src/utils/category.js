export const formatCategoryLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "ssd") return "NVMe SSD";
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};
