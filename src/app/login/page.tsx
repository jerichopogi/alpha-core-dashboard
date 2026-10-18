"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, INITIAL);

  return (
    <main className="login">
      <form action={action} className="login-card">
        <p className="eyebrow">Alpha Core · XAUUSD</p>
        <h1 className="login-title">Trading dashboard</h1>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" autoFocus required maxLength={200} />
        </label>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Checking…" : "Open dashboard"}
        </button>
      </form>
    </main>
  );
}
