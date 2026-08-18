// The Liga vozíčkářů circle mark (the wordmark is not part of it): an open
// ring, orange over the top, blue under the bottom. Used as the small badge
// that marks a staff member in the person picker, so a colleague is never
// mistaken for a client.
export function LigaMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth="3.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* bottom-left half */}
      <path d="M17.66 17.66 A8 8 0 0 1 4 12" stroke="#2E4E9E" />
      {/* top half, sweeping up to the opening on the right */}
      <path d="M4 12 A8 8 0 0 1 17.66 6.34" stroke="#E4801F" />
    </svg>
  );
}
