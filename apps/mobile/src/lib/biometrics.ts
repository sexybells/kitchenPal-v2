import * as LocalAuthentication from "expo-local-authentication";

/**
 * Thin wrapper over `expo-local-authentication`. Every call degrades to a safe
 * no-op when the device lacks hardware or has nothing enrolled, so screens can
 * offer biometric unlock without branching on platform capabilities.
 */
export const isBiometricAvailable = async (): Promise<boolean> => {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
};

/**
 * Prompt for biometric authentication. Returns `false` (never throws) when
 * unavailable or when the user cancels/fails.
 */
export const authenticateWithBiometrics = async (
  promptMessage: string,
): Promise<boolean> => {
  if (!(await isBiometricAvailable())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: false,
  });
  return result.success;
};
