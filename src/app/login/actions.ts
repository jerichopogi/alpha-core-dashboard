"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, isCorrectPassword, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth";
import { getStore } from "@/lib/store";

const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;
// Across all addresses, so a distributed guesser is slowed as well.
const MAX_ATTEMPTS_GLOBAL = 60;
const GLOBAL_WINDOW_SECONDS = 60 * 60;

export interface LoginState {
  error: string | null;
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    return { error: "Enter the dashboard password." };
  }

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const store = getStore();
  const [fromClient, fromAnyone] = await Promise.all([
    store.hit(`ac:rate:login:${client}`, WINDOW_SECONDS),
    store.hit("ac:rate:login:all", GLOBAL_WINDOW_SECONDS),
  ]);
  if (fromClient > MAX_ATTEMPTS || fromAnyone > MAX_ATTEMPTS_GLOBAL) {
    return { error: "Too many attempts. Try again later." };
  }

  if (!isCorrectPassword(password)) return { error: "That password is not correct." };

  (await cookies()).set(SESSION_COOKIE, createSessionToken(Math.floor(Date.now() / 1000)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
