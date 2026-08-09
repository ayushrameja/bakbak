import { BakbakMark } from "./BakbakMark";

export function LoadingScreen() {
  return (
    <main
      className="app-loading app-loading--animated"
      role="status"
      aria-label="Loading Bakbak"
    >
      <aside className="app-loading__sidebar" aria-hidden="true">
        <div className="brand-lockup">
          <BakbakMark className="brand-mark" />
          <span>bakbak</span>
        </div>
      </aside>
      <section className="app-loading__canvas" aria-hidden="true">
        <div className="app-loading__status">
          <BakbakMark className="brand-mark" />
          <span>Opening Bakbak</span>
          <div className="app-loading__track">
            <i />
          </div>
        </div>
      </section>
    </main>
  );
}
