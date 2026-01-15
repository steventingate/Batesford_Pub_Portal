export async function clearLegacySupabaseStorage() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('sb-'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage access errors.
  }
}
