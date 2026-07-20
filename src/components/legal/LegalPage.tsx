import Link from 'next/link';

export type LegalSection = {
  title: string;
  body: string[];
};

export type LegalPageProps = {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export function LegalPage({
  title,
  description,
  lastUpdated,
  sections,
}: LegalPageProps) {
  return (
    <div className="min-h-full bg-background">
      <section className="mx-auto flex w-full max-w-4xl flex-col px-5 py-10 sm:px-8 md:py-14">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            Back to Frogress
          </Link>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
        </div>

        <div className="space-y-7 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur sm:p-8">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                {section.title}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-sm font-medium leading-7 text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
          <Link
            href="/terms"
            className="rounded-xl border border-border bg-card px-4 py-2 text-foreground hover:bg-muted/50"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="rounded-xl border border-border bg-card px-4 py-2 text-foreground hover:bg-muted/50"
          >
            Privacy Policy
          </Link>
          <Link
            href="/refund-policy"
            className="rounded-xl border border-border bg-card px-4 py-2 text-foreground hover:bg-muted/50"
          >
            Refund Policy
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-border bg-card px-4 py-2 text-foreground hover:bg-muted/50"
          >
            Pricing
          </Link>
          <a
            href="mailto:support@frogress.com"
            className="rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Contact support
          </a>
        </div>
      </section>
    </div>
  );
}
