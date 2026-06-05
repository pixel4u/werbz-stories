import { cookies } from "next/headers";

export async function isStudioAuthenticated(): Promise<boolean> {
  await cookies();
  return true;
}

export async function requireStudioPassword(password: string): Promise<boolean> {
  void password;
  return true;
}

export async function setStudioSessionCookie(): Promise<void> {
  await cookies();
  return;
}

export async function clearStudioSessionCookie(): Promise<void> {
  await cookies();
  return;
}
