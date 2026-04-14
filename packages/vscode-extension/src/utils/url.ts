export function validateHttpUrl(value: string): string | undefined {
  if (!value.trim()) {
    return "URL is required.";
  }

  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) {
      return "URL must start with http:// or https://.";
    }
    return undefined;
  } catch {
    return "Enter a valid URL.";
  }
}
