export function StartScreen({
  onStart,
  onOpenEditor,
}: {
  onStart: () => void;
  onOpenEditor: () => void;
}): JSX.Element {
  return (
    <main className="start-screen">
      <div className="start-screen__scanline" />
      <section className="start-screen__content">
        <div className="eyebrow">FIELD COMMAND // SKIRMISH 01</div>
        <h1>
          IRON
          <br />
          DOCTRINE
        </h1>
        <p className="start-screen__lead">
          Establish your base, grow the war machine and eliminate the red command structure.
        </p>

        <div className="briefing-grid">
          <article>
            <span className="briefing-grid__number">01</span>
            <strong>Select</strong>
            <p>Left-click a unit or drag a box around your squad.</p>
          </article>
          <article>
            <span className="briefing-grid__number">02</span>
            <strong>Command</strong>
            <p>Right-click terrain to move. Right-click red forces to attack.</p>
          </article>
          <article>
            <span className="briefing-grid__number">03</span>
            <strong>Expand</strong>
            <p>Use the command panel to place structures and produce reinforcements.</p>
          </article>
        </div>

        <div className="start-screen__actions">
          <button className="primary-action" onClick={onStart}>
            Start skirmish
          </button>
          <button className="secondary-action" onClick={onOpenEditor}>
            Open map editor
          </button>
        </div>
      </section>

      <aside className="start-screen__objective">
        <span>PRIMARY OBJECTIVE</span>
        <strong>Destroy the enemy construction yard</strong>
        <p>Green forces are yours. Red forces are hostile. Protect your own command structure.</p>
      </aside>
    </main>
  );
}
