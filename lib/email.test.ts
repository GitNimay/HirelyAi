import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { esc, layout, p } from "./email";

beforeEach(() => {
  env.APP_URL = "https://hire.test";
});

describe("esc", () => {
  it("escapes every character that could break out of HTML or an attribute", () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe(
      "&#60;script&#62;alert(&#34;x&#34;)&#60;/script&#62; &#38; &#39;y&#39;",
    );
  });
});

describe("layout", () => {
  const html = () =>
    layout({ art: "verify", heading: "Confirm", body: p("Hi"), to: `"ada"<x>@mail.test`, reason: "You signed up." });

  it("links assets and the logo to the app's own URL", () => {
    expect(html()).toContain('src="https://hire.test/email/verify.png" width="181" height="104"');
    expect(html()).toContain('href="https://hire.test"');
  });

  it("escapes the recipient address", () => {
    expect(html()).toContain("This email was sent to &#34;ada&#34;&#60;x&#62;@mail.test.");
    expect(html()).not.toContain("<x>");
  });
});
