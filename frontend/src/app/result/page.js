"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

function SectionCard({ title, children }) {
  return (
    <section className="surface-soft mb-4 p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function ResultPage() {
  const [result, setResult] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let parsedResult = null;
    const raw = sessionStorage.getItem("practiceResult");

    if (raw) {
      try {
        parsedResult = JSON.parse(raw);
      } catch (error) {
        parsedResult = null;
      }
    }

    setResult(parsedResult);
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap py-8">
          <div className="surface p-6">Загрузка результата...</div>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap py-8">
          <div className="surface mx-auto max-w-3xl p-8">
            <h1 className="text-2xl font-medium text-[var(--foreground)]">Результат не найден</h1>
            <p className="mt-3 text-[var(--muted-foreground)]">Сначала пройдите практику, чтобы увидеть сохраненный анализ.</p>
            <Link href="/practice" className="btn btn-primary mt-6 inline-flex">
              К тренировке
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="page-wrap py-8">
        <div className="surface p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-medium text-[var(--foreground)]">Результат</h1>
            <div className="flex gap-2">
              <Link href="/practice" className="btn btn-primary text-sm">
                Новая попытка
              </Link>
              <Link href="/" className="btn btn-outline text-sm">
                Главная
              </Link>
            </div>
          </div>

          {result.imageUrl && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)]">
              <Image
                src={result.imageUrl}
                alt="Иллюстрация задания"
                className="h-56 w-full object-cover md:h-72"
                width={1200}
                height={700}
              />
            </div>
          )}

          <SectionCard title="Распознанный текст">
            <p className="leading-7 text-[var(--foreground)]">{result.text || "Нет данных"}</p>
          </SectionCard>

          <SectionCard title="Балл">
            <p className="text-2xl font-medium text-[var(--foreground)]">{result.score ?? 0} / 5</p>
          </SectionCard>

          <SectionCard title="Ошибки">
            {Array.isArray(result.errors) && result.errors.length > 0 ? (
              <ul className="space-y-2 text-[var(--foreground)]">
                {result.errors.map((item, index) => (
                  <li key={`${item}-${index}`} className="rounded-lg bg-[var(--card)] p-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--muted-foreground)]">Ошибки не обнаружены.</p>
            )}
          </SectionCard>

          <SectionCard title="Рекомендации">
            {Array.isArray(result.recommendations) && result.recommendations.length > 0 ? (
              <ul className="space-y-2 text-[var(--foreground)]">
                {result.recommendations.map((item, index) => (
                  <li key={`${item}-${index}`} className="rounded-lg bg-[var(--card)] p-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--muted-foreground)]">Рекомендации отсутствуют.</p>
            )}
          </SectionCard>

          <SectionCard title="Улучшенный ответ">
            <p className="leading-7 text-[var(--foreground)]">
              {result.improved_answer || "Нет улучшенного ответа."}
            </p>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
