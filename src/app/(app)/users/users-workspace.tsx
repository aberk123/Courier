"use client";

import { useActionState, useState } from "react";
import {
  inviteUser,
  sendResetLink,
  setCourierOffice,
  togglePublicationAccess,
  type InviteState,
  type ResetLinkState,
} from "./actions";

export type ManagedUser = {
  id: string;
  email: string;
  fullName: string | null;
  isCourierOffice: boolean;
  publicationIds: string[];
};

type Publication = { id: string; code: string; name: string };

const initialInviteState: InviteState = { error: null, success: null };
const initialResetState: ResetLinkState = { error: null, link: null };

export function UsersWorkspace({
  currentUserId,
  users,
  publications,
}: {
  currentUserId: string;
  users: ManagedUser[];
  publications: Publication[];
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteUser, initialInviteState);
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manage users</h1>
        <button
          type="button"
          onClick={() => setShowInvite((value) => !value)}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/20"
        >
          {showInvite ? "Cancel" : "+ Invite user"}
        </button>
      </div>

      {showInvite ? (
        <form
          action={inviteAction}
          className="mt-4 space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              name="email"
              required
              placeholder="Email"
              className="col-span-2 rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
            <input
              name="fullName"
              placeholder="Name (optional)"
              className="col-span-2 rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isCourierOffice" />
            Courier office (full access to everything)
          </label>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">Publication access</legend>
            <div className="flex flex-wrap gap-2">
              {publications.map((pub) => (
                <label
                  key={pub.id}
                  className="flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
                >
                  <input type="checkbox" name="publicationIds" value={pub.id} />
                  {pub.name}
                </label>
              ))}
            </div>
          </fieldset>

          {inviteState.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {inviteState.error}
            </p>
          ) : null}
          {inviteState.success ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              {inviteState.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={invitePending}
            className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {invitePending ? "Sending invite…" : "Send invite"}
          </button>
        </form>
      ) : null}

      <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
        {users.map((managedUser) => (
          <UserRow
            key={managedUser.id}
            user={managedUser}
            publications={publications}
            isSelf={managedUser.id === currentUserId}
          />
        ))}
      </ul>
    </div>
  );
}

function UserRow({
  user,
  publications,
  isSelf,
}: {
  user: ManagedUser;
  publications: Publication[];
  isSelf: boolean;
}) {
  const [resetState, resetAction, resetPending] = useActionState(sendResetLink, initialResetState);

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {user.email}
            {isSelf ? <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">(you)</span> : null}
          </p>
          {user.fullName ? (
            <p className="text-sm text-black/60 dark:text-white/60">{user.fullName}</p>
          ) : null}
        </div>

        <form action={setCourierOffice}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="value" value={(!user.isCourierOffice).toString()} />
          <button
            type="submit"
            disabled={isSelf}
            title={isSelf ? "You can't change your own access level here." : undefined}
            className={
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 " +
              (user.isCourierOffice
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50")
            }
          >
            Courier office
          </button>
        </form>
      </div>

      {!user.isCourierOffice ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {publications.map((pub) => {
            const on = user.publicationIds.includes(pub.id);
            return (
              <form key={pub.id} action={togglePublicationAccess}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="publicationId" value={pub.id} />
                <input type="hidden" name="grant" value={(!on).toString()} />
                <button
                  type="submit"
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium " +
                    (on
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/20 text-black/50 dark:border-white/25 dark:text-white/50")
                  }
                >
                  {pub.name}
                </button>
              </form>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-black/50 dark:text-white/50">
          Sees everything — publication access doesn&apos;t apply.
        </p>
      )}

      <form action={resetAction} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="email" value={user.email} />
        <button
          type="submit"
          disabled={resetPending}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/20"
        >
          {resetPending ? "Generating…" : "Get password reset link"}
        </button>
      </form>

      {resetState.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {resetState.error}
        </p>
      ) : null}
      {resetState.link ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-black/60 dark:text-white/60">
            Send this link to {user.email} however you like (text, email). It expires and can
            only be used once.
          </p>
          <input
            readOnly
            value={resetState.link}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-black/15 px-3 py-2 text-xs dark:border-white/20 dark:bg-black"
          />
        </div>
      ) : null}
    </li>
  );
}
