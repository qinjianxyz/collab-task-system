"use client";

type ErrorStateProps = {
  reset: () => void;
};

export function ErrorState({ reset }: ErrorStateProps) {
  return (
    <main className="error-shell">
      <section className="error-card">
        <p className="eyebrow">System</p>
        <h1>Something went wrong</h1>
        <p className="subtle-copy">
          The page hit an unexpected render error. Retry the route and keep going.
        </p>
        <button className="primary-button" onClick={() => reset()} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}
