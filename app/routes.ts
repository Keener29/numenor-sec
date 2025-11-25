import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("account-settings", "routes/account-settings.tsx"),
  route("account-deleted", "routes/account-deleted.tsx"),
  route("success", "routes/success.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("contact", "routes/contact.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
] satisfies RouteConfig;
