import React, { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

export function CodeBlock({ code, language = "cpp", maxHeight = 320 }: {
  code: string;
  language?: string;
  maxHeight?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="relative overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-base-950)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-base-850)] px-3 py-1.5">
        <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">{language}</span>
        <button className="btn !px-2 !py-0.5 text-[10.5px]" onClick={copy}>
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre
        className="mono overflow-auto p-3 text-[12px] leading-relaxed text-[var(--color-ink)]"
        style={{ maxHeight }}
      >
        {code}
      </pre>
    </div>
  );
}

export function Markdownish({ text }: { text: string }) {
  // Simple renderer: keeps code fences, headers, bullets readable.
  const blocks = text.split("\n");
  const out: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let key = 0;

  for (const line of blocks) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(
          <CodeBlock key={key++} code={codeLines.join("\n")} />
        );
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const t = line.trim();
    if (t === "") {
      out.push(<div key={key++} className="h-2" />);
    } else if (/^-{3,}$/.test(t)) {
      out.push(<div key={key++} className="my-1 border-b border-[var(--color-line)]" />);
    } else if (/^#+\s/.test(t)) {
      const level = t.match(/^#+/)![0].length;
      const cls = level === 1 ? "mt-1 mb-0.5 text-[13px] font-bold" : "mt-1 mb-0.5 text-[12px] font-semibold text-[var(--color-accent)]";
      out.push(<div key={key++} className={cls}>{t.replace(/^#+\s/, "")}</div>);
    } else if (/^•\s/.test(t) || /^\d+\.\s/.test(t)) {
      out.push(
        <div key={key++} className="flex gap-1.5 text-[12.5px] leading-relaxed">
          <span className="text-[var(--color-accent)]">{t.match(/^[•\d.]+/)?.[0]}</span>
          <span className="text-[var(--color-ink-dim)]">{t.replace(/^[•\d.]+\s*/, "")}</span>
        </div>
      );
    } else {
      out.push(
        <div key={key++} className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">
          {t}
        </div>
      );
    }
  }
  if (inCode) {
    out.push(<CodeBlock key={key++} code={codeLines.join("\n")} />);
  }
  return <div>{out}</div>;
}