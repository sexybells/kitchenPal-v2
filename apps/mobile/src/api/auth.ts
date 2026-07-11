import {
  authResultSchema,
  userResponseSchema,
  type AuthResult,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type RequestPhoneOtpInput,
  type SocialSignInInput,
  type UserResponse,
  type VerifyPhoneOtpInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** Auth endpoint wrappers — each unwraps + validates the response envelope. */
export const authApi = {
  register: (input: RegisterInput): Promise<AuthResult> =>
    api.request("auth/register", { body: input, schema: authResultSchema }),

  login: (input: LoginInput): Promise<AuthResult> =>
    api.request("auth/login", { body: input, schema: authResultSchema }),

  loginWithGoogle: (input: SocialSignInInput): Promise<AuthResult> =>
    api.request("auth/google", { body: input, schema: authResultSchema }),

  loginWithApple: (input: SocialSignInInput): Promise<AuthResult> =>
    api.request("auth/apple", { body: input, schema: authResultSchema }),

  requestPhoneOtp: (input: RequestPhoneOtpInput): Promise<void> =>
    api.request("auth/request-phone-otp", { body: input }).then(() => undefined),

  loginWithPhoneOtp: (input: VerifyPhoneOtpInput): Promise<AuthResult> =>
    api.request("auth/login-phone-otp", { body: input, schema: authResultSchema }),

  forgotPassword: (input: ForgotPasswordInput): Promise<void> =>
    api.request("auth/forgot-password", { body: input }).then(() => undefined),

  me: (): Promise<UserResponse> =>
    api.request("auth/me", { method: "GET", auth: true, schema: userResponseSchema }),

  // Public endpoint — revokes the refresh-token family by the token in the body.
  // Deliberately unauthenticated so signing out never triggers the 401→refresh
  // interceptor (which would recurse back into sign-out).
  logout: (refreshToken: string): Promise<void> =>
    api
      .request("auth/logout", { body: { refreshToken }, auth: false })
      .then(() => undefined),
};
