export const formatCountdown = (expiresAt, nowMs = Date.now()) => {
  if (!expiresAt) return "";
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return "";
  const diff = Math.max(end - nowMs, 0);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
};

export const hasActivePromotion = (item) =>
  !!(item?.promotion && item?.originalPrice && item?.price < item?.originalPrice);

export const formatPromotionBadge = (item) => {
  const promo = item?.promotion;
  if (!promo) return "";
  const type = promo.discountType;
  const value = Number(promo.discountValue || 0);
  if (type === "percent") return `${value}% off`;
  if (type === "amount") return `$${value} off`;
  return "";
};
