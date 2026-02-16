import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authAPI } from "../utils/api";
import { loginWithGoogle, loginWithMicrosoft } from "../utils/authUtils";
import { useMsal } from "@azure/msal-react";
import AzureLogin from "~/components/AzureLogin";
import { GoogleLogin } from "@react-oauth/google";
export function meta() {
  return [
    { title: "Sign Up - Numenor Security" },
    { name: "description", content: "Create your Numenor Security account" },
  ];
}

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLengthError, setPasswordLengthError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { instance } = useMsal();

  const handleGoogleSignup = async (
    credentialResponse: any,
    termsAccepted: boolean,
  ) => {
    try {
      setIsLoading(true);
      setError("");
      await loginWithGoogle(credentialResponse, termsAccepted);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-up failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAzureSignup = async (termsAccepted: boolean) => {
    try {
      setIsLoading(true);
      setError("");
      const response = await instance.loginPopup({
        scopes: ["openid", "profile", "email"],
      });
      await loginWithMicrosoft(response, termsAccepted);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Azure sign-up failed");
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setPasswordError("");
    setPasswordLengthError("");

    // Client-side validation
    if (!formData.businessName.trim()) {
      setError("Business name is required");
      setIsLoading(false);
      return;
    }

    if (!formData.ownerName.trim()) {
      setError("Contact name is required");
      setIsLoading(false);
      return;
    }

    if (!formData.email.trim()) {
      setError("Email address is required");
      setIsLoading(false);
      return;
    }

    if (!formData.email.includes("@")) {
      setError("Please enter a valid email address");
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      setIsLoading(false);
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setPasswordError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      // Split owner name into first and last name
      const nameParts = formData.ownerName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const response = await authAPI.register({
        email: formData.email,
        password: formData.password,
        firstName,
        lastName,
        businessName: formData.businessName,
        termsAccepted: true, // Since the form requires acceptance, we can set this to true
      });

      console.log("Registration successful:", response);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      console.error("Registration error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const validatePassword = (value: string, name: string) => {
    const password = name === "password" ? value : formData.password;
    const confirmPassword =
      name === "confirmPassword" ? value : formData.confirmPassword;

    // Check password length
    if (name === "password") {
      if (value.length > 0 && value.length < 8) {
        setPasswordLengthError("Password must be at least 8 characters");
      } else {
        setPasswordLengthError("");
      }
    }

    // Check password match
    if (confirmPassword && password !== confirmPassword) {
      setPasswordError("Passwords do not match");
    } else {
      setPasswordError("");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updatedFormData = {
      ...formData,
      [name]: value,
    };
    setFormData(updatedFormData);

    // Real-time password validation
    if (name === "password" || name === "confirmPassword") {
      validatePassword(value, name);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Numenor Security</h1>
          <p className="mt-2 text-sm text-gray-600">
            Phishing Protection for Small & Medium Businesses
          </p>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Sign in here
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-4 mb-6">
            <div
              className={`w-full flex flex-col items-center transition-all duration-200 ${
                !termsAccepted
                  ? "opacity-50 grayscale pointer-events-none"
                  : "opacity-100"
              }`}
            >
              <div className="w-full flex justify-center mb-3">
                <GoogleLogin
                  onSuccess={(credentialResponse) =>
                    handleGoogleSignup(credentialResponse, termsAccepted)
                  }
                  onError={() => setError("Google sign-up failed")}
                  text="signup_with"
                  theme="outline"
                  shape="pill"
                  auto_select={false}
                  useOneTap={termsAccepted}
                  width="220px"
                  logo_alignment="center"
                />
              </div>
            </div>

            {/* Microsoft Login Wrapper */}
            <div
              className={`transition-all duration-200 ${
                !termsAccepted
                  ? "opacity-50 grayscale pointer-events-none"
                  : "opacity-100"
              }`}
            >
              <AzureLogin
                handleAzureLogin={() => handleAzureSignup(termsAccepted)}
                isLoading={isLoading}
                text="Sign up with Microsoft"
              />
            </div>

            {/* Helpful hint for the user if they try to click while disabled */}
            {!termsAccepted && (
              <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest animate-pulse">
                Accept terms below to enable social sign-up
              </p>
            )}
          </div>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">
                Or continue with email
              </span>
            </div>
          </div>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="businessName"
                className="block text-sm font-medium text-gray-700"
              >
                Business Name
              </label>
              <div className="mt-1">
                <input
                  id="businessName"
                  name="businessName"
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter your business name"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="ownerName"
                className="block text-sm font-medium text-gray-700"
              >
                Contact Name
              </label>
              <div className="mt-1">
                <input
                  id="ownerName"
                  name="ownerName"
                  type="text"
                  required
                  value={formData.ownerName}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className={`form-input ${passwordLengthError ? "form-input-error" : ""}`}
                  placeholder="Create a password"
                />
                {passwordLengthError && (
                  <div className="error-message">{passwordLengthError}</div>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm Password
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`form-input ${passwordError ? "form-input-error" : ""}`}
                  placeholder="Confirm your password"
                />
              </div>
              {passwordError && (
                <div className="error-message">{passwordError}</div>
              )}
            </div>

            <div className="flex items-center">
              <input
                id="agree-terms"
                name="agree-terms"
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="form-checkbox"
              />
              <label
                htmlFor="agree-terms"
                className="ml-2 block text-sm text-gray-900"
              >
                I have read and agree to the <br />
                <Link
                  to="/terms"
                  className="text-blue-600 hover:text-blue-500 underline"
                >
                  Beta Participation Terms
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="text-blue-600 hover:text-blue-500 underline"
                >
                  Privacy Policy
                </Link>
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? "Creating account..." : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
