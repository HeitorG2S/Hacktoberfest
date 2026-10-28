import { describe, it, expect } from "vitest";
import { CATEGORY_LABEL, GROUP_LABEL } from "./labels";
import { CATEGORY_SLUGS } from "../../contracts/import-format";

describe("labels", () => {
  it("every CATEGORY_SLUG has a label in CATEGORY_LABEL", () => {
    for (const slug of CATEGORY_SLUGS) {
      const label = CATEGORY_LABEL[slug];
      expect(label).toBeDefined();
      expect(typeof label).toBe("string");
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  it("GROUP_LABEL has expected keys", () => {
    expect(GROUP_LABEL.fixed).toBe("Fixas");
    expect(GROUP_LABEL.variableEssential).toBe("Essenciais");
    expect(GROUP_LABEL.debt).toBe("Dívidas");
  });
});