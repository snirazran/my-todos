import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { requireSessionAuth } from '@/lib/auth';
import { oauthConfigured } from '@/lib/oauth/keys';
import { buildRedirect, validateAuthorizeRequest } from '@/lib/oauth/authorize';

export const dynamic = 'force-dynamic';

const SCOPE_LABELS: Record<string, string> = {
  'tasks:read': 'Read your tasks, sections, and tags',
  'tasks:write': 'Create tasks and mark them complete',
  'progress:read': 'See your streak and fly count',
};

type SearchParams = Record<string, string | string[] | undefined>;

function flatten(params: SearchParams) {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border-2 border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-foreground">
          Couldn&apos;t connect
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground">
          {message}
        </p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!oauthConfigured()) {
    return (
      <ErrorCard message="This server is not configured to authorize AI assistants yet." />
    );
  }

  const raw = flatten(await searchParams);
  const validation = await validateAuthorizeRequest(raw);

  if (!validation.ok) {
    if (validation.fatal) return <ErrorCard message={validation.error} />;
    redirect(
      buildRedirect(validation.redirectUri, {
        error: validation.error,
        state: validation.state,
      }),
    );
  }

  try {
    await requireSessionAuth();
  } catch {
    const query = new URLSearchParams(
      Object.entries(raw).filter(([, v]) => v !== undefined) as [
        string,
        string,
      ][],
    );
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const { client, params } = validation;
  const clientHost = (() => {
    try {
      return new URL(client.clientUri ?? client.clientId).host;
    } catch {
      return client.clientId;
    }
  })();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border-2 border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/icon.png"
            alt=""
            width={56}
            height={56}
            className="rounded-2xl"
          />
          <h1 className="mt-4 text-xl font-black tracking-tight text-foreground">
            Connect {client.clientName || clientHost} to Frogress?
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
            {clientHost} is asking to work with your tasks on your behalf.
          </p>
        </div>

        <ul className="mt-6 space-y-3">
          {params.scopes.map((scope) => (
            <li key={scope} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-3 w-3 text-primary" strokeWidth={3} />
              </span>
              <span className="text-sm font-medium leading-5 text-foreground">
                {SCOPE_LABELS[scope] ?? scope}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 rounded-2xl bg-muted/60 px-4 py-3 text-xs font-medium leading-5 text-muted-foreground">
          It can&apos;t see your password, change your account, or make
          purchases. You can disconnect it any time from Settings.
        </p>

        <form action="/api/oauth/approve" method="POST" className="mt-6 space-y-3">
          <input type="hidden" name="client_id" value={params.clientId} />
          <input type="hidden" name="redirect_uri" value={params.redirectUri} />
          <input
            type="hidden"
            name="code_challenge"
            value={params.codeChallenge}
          />
          <input type="hidden" name="code_challenge_method" value="S256" />
          <input type="hidden" name="response_type" value="code" />
          <input type="hidden" name="resource" value={params.resource} />
          <input type="hidden" name="scope" value={params.scopes.join(' ')} />
          {params.state ? (
            <input type="hidden" name="state" value={params.state} />
          ) : null}

          <button
            type="submit"
            name="decision"
            value="allow"
            className="w-full rounded-2xl bg-primary px-5 py-4 text-base font-black text-primary-foreground shadow-sm transition active:scale-[0.99]"
          >
            Connect
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="w-full rounded-2xl border-2 border-border bg-card px-5 py-3 text-sm font-bold text-muted-foreground transition active:scale-[0.99]"
          >
            Cancel
          </button>
        </form>
      </div>
    </main>
  );
}
