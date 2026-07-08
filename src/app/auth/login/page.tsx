import { redirect } from "next/navigation";

// Login has been removed: identity is name + phone, captured once at /setup and
// backed by a silent anonymous account per device. Anything still pointing here
// (old bookmarks, sign-out) lands on setup, which reuses the existing session if
// one is present rather than creating a duplicate.
export default function LoginRedirect() {
  redirect("/setup");
}
