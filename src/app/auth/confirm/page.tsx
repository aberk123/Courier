import { confirmRecoveryLink } from "./actions";

/**
 * Password-reset and invite links land here, and this page deliberately does
 * NOT verify the token on load.
 *
 * These tokens are single-use, and a link sent by text or email gets fetched by
 * things that are not the recipient: iMessage/WhatsApp building a preview card,
 * Outlook Safe Links and other mail scanners, antivirus, corporate proxies. When
 * verification happened on GET, whichever of those touched the URL first spent
 * the token, and the actual person was then told the link had expired. That is
 * exactly what happened to two staffers on 2026-08-20 -- see the incident in
 * docs/handoff.md.
 *
 * So the token is only spent by an explicit POST from this form. A preview
 * fetch renders this page harmlessly and changes nothing.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash: tokenHash, type, next } = await searchParams;

  if (!tokenHash || !type) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black">
          <h1 className="text-xl font-semibold">This link is incomplete</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            It may have been cut short when it was copied or forwarded. Ask the courier
            office for a fresh one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        action={confirmRecoveryLink}
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-black"
      >
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Tap the button to continue. This link works only once, so use it when you&apos;re
          ready to choose a password.
        </p>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/reset-password"} />
        <button
          type="submit"
          className="w-full rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
