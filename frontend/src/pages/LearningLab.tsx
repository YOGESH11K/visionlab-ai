import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";

interface QuizQuestion {
  key: string;
  question: string;
  options: string[];
  answer: string;
}

interface Suggestion {
  title: string;
  difficulty: string;
  components: string[];
  concept: string;
  code: string;
  upgrades: string[];
}

export function LearningLab() {
  const { notify } = useStore();
  const [keys, setKeys] = useState<Record<string, { attempts: number; score: number; percent: number }>>({});
  const [quizNames, setQuizNames] = useState<Record<string, string>>({});
  const [quizKey, setQuizKey] = useState("");
  const [quiz, setQuiz] = useState<{ key: string; name: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; total: number; percent: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const loadProgress = useCallback(async () => {
    try {
      const r = await api.get<{ keys: typeof keys; quizzes: Record<string, string> }>("/api/learning/progress");
      setKeys(r.keys);
      setQuizNames(r.quizzes);
      if (!quizKey) setQuizKey(Object.keys(r.quizzes)[0] ?? "");
    } catch { /* ignore */ }
  }, [quizKey]);

  useEffect(() => {
    loadProgress();
    api.get<{ suggestions: Suggestion[] }>("/api/learning/suggestions").then((s) => setSuggestions(s.suggestions)).catch(() => {});
  }, [loadProgress]);

  const start = async (key: string) => {
    setQuizKey(key);
    setQuiz(null);
    setAnswers({});
    setResult(null);
    try {
      const r = await api.get<{ ok: boolean; key: string; name: string; questions: QuizQuestion[] }>(`/api/learning/quiz/${key}`);
      if (r.ok) setQuiz(r);
      else notify("warn", r.ok ? "" : "Unknown quiz");
    } catch (e) {
      notify("error", `Load failed: ${e}`);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    const answersArr = quiz.questions.map((q) => {
      const selected = answers[q.question];
      return {
        question: q.question,
        selected: selected ?? "",
        correct: selected === q.answer,
      };
    });
    try {
      const r = await api.post<{ ok: boolean; score: number; total: number; percent: number }>(
        `/api/learning/quiz/${quiz.key}/submit`,
        { answers: answersArr }
      );
      setResult(r);
      notify(r.percent >= 70 ? "success" : "warn", `${r.score}/${r.total} — ${r.percent}%`);
      loadProgress();
    } catch (e) {
      notify("error", `Submit failed: ${e}`);
    }
  };

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-3">
        <Panel title="Quizzes" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {Object.entries(quizNames).map(([key, name]) => {
              const p = keys[key];
              return (
                <button
                  key={key}
                  className={`rounded border px-2.5 py-2 text-left ${
                    quizKey === key
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5"
                      : "border-[var(--color-line)] hover:border-[var(--color-accent)]/40"
                  }`}
                  onClick={() => start(key)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--color-ink)]">{name}</span>
                    {p && (
                      <Tag color={p.percent >= 70 ? "var(--color-good)" : "var(--color-warn)"}>{p.percent}%</Tag>
                    )}
                  </div>
                  {p && (
                    <p className="mono mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                      {p.attempts} attempts · {p.score} correct
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Project ideas" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-2 p-3">
            {suggestions.map((s) => (
              <div key={s.title} className="rounded-md border border-[var(--color-line)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">{s.title}</span>
                  <Tag color={s.difficulty === "beginner" ? "var(--color-good)" : "var(--color-warn)"}>{s.difficulty}</Tag>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-dim)]">{s.concept}</p>
                <p className="mono mt-1 text-[10px] text-[var(--color-ink-faint)]">{s.components.join(" · ")}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {quiz ? (
          <Panel title={quiz.name} right={result && <Tag color={result.percent >= 70 ? "var(--color-good)" : "var(--color-warn)"}>{result.percent}%</Tag>} bodyClassName="overflow-y-auto">
            <div className="space-y-4 p-3">
              {result && (
                <div className={`rounded-md border px-3 py-2 text-[12.5px] ${
                  result.percent >= 70
                    ? "border-[var(--color-good)]/40 bg-[var(--color-good)]/5 text-[var(--color-good)]"
                    : "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/5 text-[var(--color-warn)]"
                }`}>
                  Score {result.score}/{result.total} ({result.percent}%).
                  {result.percent >= 70 ? " Keep it up!" : " Review the questions and retry."}
                </div>
              )}

              {quiz.questions.map((q, i) => {
                const chosen = answers[q.question];
                const wrongPick = result && !!chosen && chosen !== q.answer;
                return (
                  <div key={i} className="rounded-md border border-[var(--color-line)] p-3">
                    <div className="mb-2 flex items-start gap-2">
                      <span className="mono text-[10px] text-[var(--color-ink-faint)]">Q{i + 1}</span>
                      <p className="text-[13px] font-medium text-[var(--color-ink)]">{q.question}</p>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((opt, oi) => {
                        const isChosen = chosen === opt;
                        const isCorrect = result && opt === q.answer;
                        const isWrongPick = result && isChosen && opt !== q.answer;
                        let cls = "border-[var(--color-line)] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/50";
                        if (isCorrect) cls = "border-[var(--color-good)]/60 bg-[var(--color-good)]/5 text-[var(--color-good)]";
                        else if (isWrongPick) cls = "border-[var(--color-bad)]/60 bg-[var(--color-bad)]/5 text-[var(--color-bad)]";
                        else if (isChosen) cls = "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5 text-[var(--color-ink)]";
                        return (
                          <button
                            key={oi}
                            disabled={!!result}
                            className={`rounded border px-2.5 py-1.5 text-left text-[12px] transition-colors ${cls}`}
                            onClick={() => setAnswers((a) => ({ ...a, [q.question]: opt }))}
                          >
                            {String.fromCharCode(65 + oi)}. {opt}
                            {isCorrect && <span className="ml-1.5">✓</span>}
                            {isWrongPick && <span className="ml-1.5 text-[var(--color-bad)]">✗</span>}
                          </button>
                        );
                      })}
                    </div>
                    {result && wrongPick && (
                      <p className="mt-2 text-[11.5px] text-[var(--color-bad)]">Correct answer: {q.answer}</p>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={submit} disabled={!!result}>
                  Submit answers
                </button>
                <button className="btn" onClick={() => { setAnswers({}); setResult(null); }}>
                  Reset
                </button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Pick a quiz" bodyClassName="flex items-center justify-center">
            <p className="px-8 text-center text-[12px] text-[var(--color-ink-faint)]">
              Choose a quiz to test your electronics knowledge. Results are tracked per topic so you
              can see where to focus.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}