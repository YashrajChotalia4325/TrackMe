/** Indian Rupee formatting (en-IN grouping, e.g. ₹1,25,000). */
export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
