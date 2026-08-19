import React, { useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { CodeBlock } from "../components/CodeBlock";
import { useStore } from "../lib/store";
import { IconDownload } from "../components/icons";

const EXAMPLES = [
  "Turn on LED when distance is less than 10 cm",
  "Turn on LED when temperature is greater than 30",
  "Turn on relay when light is less than 200",
  "Beep the buzzer when distance is less than 20 cm",
  "Move servo to 90 degrees when a button is pressed",
];

interface GenResult {
  ok: boolean;
  code: string;
  components?: string[];
  pins?: string[];
  explanation?: string;
  expected?: string;
  error?: string;
}

export function CodeGenerator() {
  const { notify } = useStore();
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async (text?: string) => {
    const d = (text ?? desc).trim();
    if (!d) return;
    setBusy(true);
    setDesc(text ? "" : desc);
    try {
      const r = await api.post<GenResult>("/api/ai/generate", { description: d });
      setResult(r);
      if (!r.ok) notify("warn", r.error ?? "Could not generate");
      else notify("success", "Code generated");
    } catch (e) {
      notify("error", `Generation failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result?.ok) return;
    try {
      const r = await api.post<{ id: number }>("/api/ai/generate/save", {
        name: "Generated project",
        description: desc,
        code: result.code,
      });
      notify("success", `Saved as project #${r.id} (Projects tab)`);
    } catch (e) {
      notify("error", `Save failed: ${e}`);
    }
  };

  const download = () => {
    if (!result?.ok) return;
    const blob = new Blob([result.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "empire_generated.ino";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-3">
        <Panel title="Describe the behaviour" bodyClassName="p-3">
          <div className="flex flex-col gap-2">
            <textarea
              className="input min-h-[90px] w-full resize-y"
              placeholder="Turn on LED when distance is less than 10 cm"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <button className="btn btn-primary self-start" onClick={() => generate()} disabled={busy}>
              Generate code
            </button>
            <div className="mt-1 flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="rounded border border-[var(--color-line)] px-2 py-1.5 text-left text-[11.5px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-ink)]"
                  onClick={() => { setDesc(ex); generate(ex); }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Upload policy" bodyClassName="p-3">
          <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
            Empire never uploads code to hardware automatically. Generated sketches are for
            review in the Arduino IDE. Hardware flashing always requires your explicit action.
          </p>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {result?.ok ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {result.components?.map((c) => <Tag key={c} color="var(--color-accent)">{c}</Tag>)}
              {result.pins?.map((p) => <Tag key={p}>{p}</Tag>)}
            </div>
            <Panel title="Generated Arduino Sketch" bodyClassName="overflow-y-auto">
              <div className="p-3">
                <CodeBlock code={result.code} language="cpp" maxHeight={380} />
              </div>
            </Panel>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Explanation" bodyClassName="p-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{result.explanation}</p>
              </Panel>
              <Panel title="Expected behaviour" bodyClassName="p-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{result.expected}</p>
              </Panel>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={save}>Save to Projects</button>
              <button className="btn" onClick={download}><IconDownload size={13} /> Download .ino</button>
            </div>
          </>
        ) : (
          <Panel title="Generated code will appear here" bodyClassName="flex items-center justify-center">
            <p className="px-8 text-center text-[12px] text-[var(--color-ink-faint)]">
              Describe a behaviour in plain English. Empire parses sensors and outputs, then
              produces a compilable Arduino sketch with components, pins and an explanation.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}