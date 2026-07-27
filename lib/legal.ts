export const merchantIdentity = {
  name: process.env.NEXT_PUBLIC_TEXTBACK_LEGAL_NAME?.trim() || "",
  organizationNumber: process.env.NEXT_PUBLIC_TEXTBACK_ORG_NUMBER?.trim() || "",
  address: process.env.NEXT_PUBLIC_TEXTBACK_ADDRESS?.trim() || "",
};

export function hasMerchantIdentity() {
  return Boolean(merchantIdentity.name && merchantIdentity.organizationNumber && merchantIdentity.address);
}

export function requireMerchantIdentity() {
  if (!hasMerchantIdentity()) throw new Error("MERCHANT_IDENTITY_NOT_CONFIGURED");
  return merchantIdentity;
}
