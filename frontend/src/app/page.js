import Link from "next/link";

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6.5C4 5.67 4.67 5 5.5 5H10c1.38 0 2.5 1.12 2.5 2.5V19H8c-2.2 0-4-1.8-4-4V6.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 6.5c0-.83-.67-1.5-1.5-1.5H14c-1.38 0-2.5 1.12-2.5 2.5V19H16c2.2 0 4-1.8 4-4V6.5Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 11a6 6 0 1 0 12 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 17v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6" y="11" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.7" />
      <rect x="11" y="7" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.7" />
      <rect x="16" y="4" width="3" height="13" rx="1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5v-6Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

const features = [
  {
    icon: <BookIcon />,
    title: "Формат экзамена",
    description: "Тренируйтесь в условиях, максимально приближенных к реальному экзамену",
  },
  {
    icon: <MicIcon />,
    title: "Автопроверка речи",
    description: "Мгновенная оценка произношения, интонации и беглости речи",
  },
  {
    icon: <ChartIcon />,
    title: "Отслеживание прогресса",
    description: "Наглядная статистика и рекомендации по улучшению результатов",
  },
  {
    icon: <MessageIcon />,
    title: "Подробная обратная связь",
    description: "Разбор ошибок и персональные рекомендации после каждой попытки",
  },
];

const steps = [
  {
    id: "01",
    title: "Выберите задание",
    description: "Начните с чтения текста, ответов на вопросы или монолога",
  },
  {
    id: "02",
    title: "Запишите свой ответ",
    description: "Говорите в микрофон в удобном темпе, система запишет вашу речь",
  },
  {
    id: "03",
    title: "Получите оценку",
    description: "Мгновенный анализ с баллами, ошибками и рекомендациями",
  },
];

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="page-wrap home-hero">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-4xl font-medium leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
            Подготовка к устной части
            <span className="mt-2 block text-[var(--primary)]">ОГЭ и ЕГЭ по английскому</span>
          </h1>
          <p className="mb-10 text-xl leading-relaxed text-[var(--muted-foreground)]">
            Онлайн-тренажер с автоматической проверкой произношения и детальной обратной связью
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-8 py-4 text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              Начать бесплатно
              <ArrowIcon />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--secondary)] px-8 py-4 text-[var(--secondary-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              Как это работает
            </a>
          </div>
        </div>
      </section>

      <section className="bg-[var(--secondary)] py-20">
        <div className="page-wrap">
          <h2 className="mb-16 text-center text-3xl font-medium text-[var(--foreground)] sm:text-4xl">
            Все необходимое для успешной сдачи
          </h2>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
                <div className="mb-4 text-[var(--primary)]">{feature.icon}</div>
                <h3 className="mb-3 text-lg font-medium text-[var(--foreground)]">{feature.title}</h3>
                <p className="leading-relaxed text-[var(--muted-foreground)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="page-wrap home-how">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-16 text-center text-3xl font-medium text-[var(--foreground)] sm:text-4xl">
            Три шага к успеху
          </h2>

          <div className="space-y-12">
            {steps.map((step) => (
              <article key={step.id} className="flex items-start gap-8">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]">
                  <span className="text-2xl font-medium text-[var(--accent-foreground)]">{step.id}</span>
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-2xl font-medium text-[var(--foreground)]">{step.title}</h3>
                  <p className="text-lg leading-relaxed text-[var(--muted-foreground)]">{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--primary)] py-20">
        <div className="page-wrap">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 text-3xl font-medium text-[var(--primary-foreground)] sm:text-4xl">
              Готовы начать подготовку?
            </h2>
            <p className="mb-8 text-xl text-[color:rgb(255_255_255_/_0.9)]">
              Присоединяйтесь к тысячам учеников, которые уже улучшили свои результаты
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--card)] px-8 py-4 text-[var(--foreground)] transition-opacity hover:opacity-90"
            >
              Создать аккаунт бесплатно
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
