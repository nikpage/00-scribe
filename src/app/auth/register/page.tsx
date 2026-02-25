"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      // 1. Get registration options from server
      const optionsRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "options" }),
      });
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || "Failed to get registration options");
      }
      const options = await optionsRes.json();

      // 2. Create credential with authenticator
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify with server
      const verifyRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "verify", credential }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Registration complete!</h1>
          <p className="text-muted-foreground">Your passkey has been saved.</p>
          <a
            href="/auth/authenticate"
            className="inline-block rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary-light"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Scribe</h1>
          <p className="mt-2 text-muted-foreground">Create your account</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light"
          >
            Register with passkey
          </button>
        </form>
        <div className="text-center">
          <a href="/auth/login" className="text-sm text-primary hover:underline">
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
