/**
 * Default public payment profile links for the portal when env vars are unset.
 * Override on deploy via PORTAL_PAYPAL_URL, PORTAL_VENMO_URL, etc.
 *
 * Venmo: use the profile URL from Venmo (often https://account.venmo.com/u/Your-Username).
 */
module.exports = {
  brand: "Steindahl 3D Group",
  /** Full amount due when the client confirms the quote — no partial deposits. */
  fullPaymentOnly: true,
  links: {
    paypal: "https://paypal.me/project35",
    venmo: "https://account.venmo.com/u/Miguel-Mercado-110",
    cashApp: "https://cash.app/$Steindahl3DGroup",
  },
  /** Shown only in the “Copy” action for Zelle, not as visible paragraph text in the portal. */
  zelleNote: "Send the full amount via Zelle to: strreetsofmercahnt@gmail.com",
  cashAppTag: "$Steindahl3DGroup",
};
