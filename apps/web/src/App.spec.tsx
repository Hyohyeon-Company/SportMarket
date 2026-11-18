import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "./App";

describe("App (S1 static shell)", () => {
  it("renders the app bar and the home heading", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('class="appbar"');
    expect(html).toContain("홈짐 · 덤벨 · 플레이트");
  });

  it("keeps the sell entry point inert until the registration flow exists", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("판매하기");
    expect(html).toContain("disabled");
  });
});
