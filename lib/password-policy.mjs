export const MIN_NEW_PASSWORD_LENGTH = 8;

export function validateNewPassword(password = "") {
  const value = String(password || "");
  if (value.length < MIN_NEW_PASSWORD_LENGTH) {
    return { valid:false, reasonCode:"PASSWORD_TOO_SHORT", message:`Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.` };
  }
  return { valid:true, reasonCode:"PASSWORD_ACCEPTED", message:null };
}
