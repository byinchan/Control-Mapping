import { CATALOGS } from "@/lib/catalog/catalogs.ts";

export default function Home() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Control Mapping &amp; Framework Alignment</h1>
      <p className="text-slate-700">
        Pacific Utilities Corporation (fictional). Map controls to NIST CSF 2.0, ISO/IEC 27001:2022,
        CIS Controls v8.1 and SOC 2 Trust Services Criteria.
      </p>
      <h2 className="pt-2 text-lg font-medium">Reference catalogs</h2>
      <ul className="list-disc pl-6 text-sm text-slate-700">
        {CATALOGS.map((c) => (
          <li key={c.framework}>
            {c.name}: {c.items.length} IDs
            {c.labelType === "own-label" ? " (own short labels)" : " (NIST text)"}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">Scaffold only. The workflow is not built yet.</p>
    </section>
  );
}
