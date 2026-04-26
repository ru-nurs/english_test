import Link from "next/link";

const freeItems = [
  "5 попыток в неделю",
  "Базовая обратная связь",
  "История последних 10 попыток",
  "Все типы заданий",
];

const proItems = [
  "Неограниченные попытки",
  "Детальная обратная связь с рекомендациями",
  "Полная история всех попыток",
  "Расширенная аналитика прогресса",
  "Персональные советы по улучшению",
  "Приоритетная поддержка",
];

const faqs = [
  {
    question: "Можно ли отменить подписку в любое время?",
    answer:
      "Да, вы можете отменить подписку в любой момент без дополнительных комиссий. Доступ к Pro сохранится до конца оплаченного периода.",
  },
  {
    question: "Есть ли скидки для школ и репетиторов?",
    answer:
      "Да, мы предоставляем специальные корпоративные тарифы для образовательных учреждений и репетиторов. Свяжитесь с нами для получения деталей.",
  },
  {
    question: "Какие способы оплаты доступны?",
    answer:
      "Мы принимаем оплату банковскими картами Visa, MasterCard и МИР, а также через СБП и электронные кошельки.",
  },
];

function CheckIcon({ light = false }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={light ? "text-[var(--primary-foreground)]" : "text-[var(--success)]"}>
      <path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FAQCard({ question, answer }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h3 className="mb-3 text-lg font-medium text-[var(--foreground)]">{question}</h3>
      <p className="leading-relaxed text-[var(--muted-foreground)]">{answer}</p>
    </article>
  );
}

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="page-wrap py-8 sm:py-12">
        <section className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-medium text-[var(--foreground)] sm:text-5xl">Выберите подходящий тариф</h1>
          <p className="text-xl text-[var(--muted-foreground)]">Начните бесплатно или получите неограниченный доступ</p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-medium text-[var(--foreground)]">Free</h2>
              <p className="text-[var(--muted-foreground)]">Для знакомства с платформой</p>
            </div>

            <div className="mb-8 flex items-baseline gap-2">
              <span className="text-4xl font-medium text-[var(--foreground)]">0 ₽</span>
              <span className="text-[var(--muted-foreground)]">навсегда</span>
            </div>

            <ul className="mb-8 space-y-4">
              {freeItems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon />
                  <span className="text-[var(--foreground)]">{item}</span>
                </li>
              ))}
            </ul>

            <button type="button" className="w-full rounded-xl bg-[var(--secondary)] py-3.5 text-[var(--secondary-foreground)] transition-colors hover:bg-[var(--muted)]">
              Текущий тариф
            </button>
          </article>

          <article className="relative overflow-hidden rounded-2xl bg-[var(--primary)] p-8 text-[var(--primary-foreground)]">
            <div className="absolute right-4 top-4">
              <div className="rounded-lg bg-[var(--warning)] px-3 py-1 text-sm">Популярный</div>
            </div>

            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-medium">Pro</h2>
              <p className="text-[color:rgb(255_255_255_/_0.9)]">Для серьезной подготовки</p>
            </div>

            <div className="mb-8 flex items-baseline gap-2">
              <span className="text-4xl font-medium">490 ₽</span>
              <span className="text-[color:rgb(255_255_255_/_0.9)]">/месяц</span>
            </div>

            <ul className="mb-8 space-y-4">
              {proItems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon light />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link href="/profile" className="block w-full rounded-xl bg-[var(--card)] py-3.5 text-center text-[var(--foreground)] transition-opacity hover:opacity-90">
              Перейти на Pro
            </Link>
          </article>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-medium text-[var(--foreground)]">Часто задаваемые вопросы</h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <FAQCard key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
