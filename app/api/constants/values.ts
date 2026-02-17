export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  domain:
    process.env.NODE_ENV === "production"
      ? ".numenorsecurity.com"
      : "localhost",
  maxAge: 24 * 60 * 60 * 1000, // 1 day
};
