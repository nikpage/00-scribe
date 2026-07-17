import { redirect } from "next/navigation";

// Superseded by the unified phone-first flow at /setup, which handles both
// new and returning workers from one screen. Kept as a redirect for any
// bookmarked/shared links to the old standalone page.
export default function PhoneLoginRedirect() {
  redirect("/setup");
}
