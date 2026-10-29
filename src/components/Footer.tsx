import Link from "next/link";
import site from "../../config/site.json";

function IconButton({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      aria-label={label}
      className="w-9 h-9 rounded-full border border-line-strong flex items-center justify-center text-muted hover:text-ink hover:border-muted"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-6 sm:items-center">
        <p className="text-sm text-muted max-w-[760px] leading-relaxed">
          <span className="text-ink">Independent prototype</span> by <Link href="/about" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">{site.builder}</Link>, built to study NeoSigma&apos;s market.{" "}
          <span className="text-ink">Not affiliated with or endorsed by NeoSigma.</span> Coverage based on neosigma.ai as of{" "}
          {site.coverage_as_of}.
        </p>
        <div className="sm:ml-auto flex gap-3">
          {site.email && (
            <IconButton href={`mailto:${site.email}`} label="Email">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
            </IconButton>
          )}
          {site.github_url && (
            <IconButton href={site.github_url} label="GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>
            </IconButton>
          )}
          {site.linkedin_url && (
            <IconButton href={site.linkedin_url} label="LinkedIn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.12 1.43-2.12 2.9V21h-4V9Z" /></svg>
            </IconButton>
          )}
        </div>
      </div>
    </footer>
  );
}
