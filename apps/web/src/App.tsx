/**
 * S1 (홈 · 탐색) static shell.
 *
 * Scope of this card: structure, semantics and token usage only. There is no
 * data fetching, no API client, no routing and no interaction. Controls that
 * need behaviour are rendered `disabled` rather than wired to a dead handler,
 * so the shell cannot look like a working feature it does not have.
 *
 * The screen contract (component → class mapping, 360px rules, state map) is in
 * the pinned design handoff; full S1 implementation is a later card.
 *
 * Open product item: the visible product name is undecided (handoff O1), so the
 * shell uses the repository name `SportMarket` instead of the tentative
 * `홈짐장터` label.
 */
export function App() {
  return (
    <div className="page">
      <header className="appbar">
        <p className="brand">SportMarket</p>
        <p className="brand-note">운동 장비만 모은 중고거래</p>
      </header>

      <main className="page-body">
        <h1 className="title">홈짐 · 덤벨 · 플레이트</h1>

        <div className="toolbar">
          <span className="chip chip--active">전체</span>
          <span className="chip">덤벨</span>
          <span className="chip">플레이트</span>
          <span className="chip">홈짐</span>
          <span className="chip">바벨·기타</span>
        </div>

        <div className="sell-row">
          <p className="sell-copy">안 쓰는 장비를 정리하고 바로 판매하세요.</p>
          <button type="button" className="btn btn--sell" disabled>
            판매하기
          </button>
        </div>

        <section className="list" aria-label="매물 목록">
          <p className="empty">아직 등록된 매물이 없습니다.</p>
        </section>
      </main>
    </div>
  );
}
