/** Production ListWise URL — used for password-recovery email redirects. */
export const PRODUCTION_APP_URL = "https://listwise.vercel.app"

/** Where Supabase sends users after they click the recovery link. */
export function getPasswordRecoveryRedirectUrl() {
  return `${PRODUCTION_APP_URL}/reset-password`
}
