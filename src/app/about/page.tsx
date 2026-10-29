import Link from "next/link";
import type { Metadata } from "next";
import site from "../../../config/site.json";
import { getHeadline } from "@/lib/data";
import { getMeta } from "@/lib/meta";
import { readSources } from "@/lib/sources";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About" };

function Contact({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
      className="group rounded-[14px] border border-line bg-surface p-5 hover:border-line-strong hover:bg-surface-2 transition-colors min-w-0">
      <div className="label mb-2">{label}</div>
      <div className="text-ink text-[16px] break-all group-hover:underline underline-offset-4">{value}</div>
    </a>
  );
}

export default function AboutPage() {
  const h = getHeadline();
  const fetched = getMeta<{ postingsSeen: number }>("last_fetch");
  const companies = readSources().length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-14 pb-12">
        <div className="label mb-4">About</div>
        <h1 className="display !text-[clamp(40px,6vw,56px)]">{site.builder}</h1>
        <p className="mono text-body mt-4">{site.location}</p>
        <a href={site.role_url} target="_blank" rel="noreferrer"
          className="mt-8 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-line-strong bg-surface px-5 py-4 hover:border-muted transition-colors">
          <span className="label">Applying for</span>
          <span className="text-[17px] font-medium text-ink">{site.role_title}</span>
          <span className="text-[14px] text-body">{site.role_team} · {site.role_location}</span>
          <span className="text-[14px] text-ink underline underline-offset-4 decoration-line-strong">View the posting ↗</span>
        </a>
        <p className="mt-8 text-[19px] text-body max-w-[900px] leading-relaxed">
          I built {site.name} to study NeoSigma&apos;s market from the outside: which companies pay people to do NeoSigma&apos;s
          work by hand, what that work costs them, and what the product doesn&apos;t cover yet.{" "}
          <span className="text-ink">I&apos;d like to be considered for the Founding Business Generalist role on NeoSigma&apos;s Product and Growth team.</span>
        </p>
      </div>

      <section className="mb-16">
        <div className="secnum mb-2">01</div>
        <h2 className="h-page mb-6">Contact</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Contact href={`mailto:${site.email}`} label="Email" value={site.email} />
          <Contact href={site.linkedin_url} label="LinkedIn" value={site.linkedin_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} />
          <Contact href={site.github_url} label="GitHub" value={site.github_url.replace(/^https?:\/\//, "")} />
        </div>
      </section>

      <section>
        <div className="secnum mb-2">02</div>
        <h2 className="h-page mb-6">What this prototype does</h2>
        <ul className="flex flex-col gap-3 text-[17px] text-body max-w-[900px]">
          <li>
            Reads public job boards for <span className="text-ink">{companies} companies</span>
            {fetched ? <> ({fetched.postingsSeen.toLocaleString()} postings in the latest run)</> : null} and judges each role on its
            description, not just its title.
          </li>
          <li>
            Splits every posting into single duties, matches them to NeoSigma&apos;s six tasks, and checks for proof of a live agent.
            Every highlighted duty is quoted word for word from the posting.
          </li>
          <li>
            Ranks <Link href="/leads" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">{h.companies} lead companies</Link> with
            {" "}{h.roles} qualifying roles, and writes a cited brief and a draft opening message for the strongest.
          </li>
          <li>
            Shows the pay behind that work: qualifying roles average <Link href="/salary" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">{h.avgSalary != null ? money(h.avgSalary, { compact: true }) : "—"} a year</Link> where
            a salary is posted. It also groups <Link href="/gaps" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">work NeoSigma doesn&apos;t cover yet</Link> into themes.
          </li>
          <li>
            Shows how every number is made on the <Link href="/method" className="text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">Method</Link> page.
          </li>
        </ul>
      </section>
    </div>
  );
}
