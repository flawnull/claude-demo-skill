import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nameShape, verdict, slugName } from "../lib/names.mjs";

describe("invented product names", () => {
  test("a short one-word name passes the shape check", () => assert.deepEqual(nameShape("Tally"), []));
  test("a long name is refused", () => assert.ok(nameShape("Subscriptionator").length));
  test("a two-word name is refused", () => assert.ok(nameShape("Ditch It").length));
  test("a name any real product uses is taken", () => {
    assert.equal(verdict("Snip", [{ source: "App Store", found: true, detail: '"Snip" by X' }]).ok, false);
  });
  test("a registered domain or an old package alone does not make a name taken", () => {
    const v = verdict("Vorla", [{ source: "vorla.io", found: true, weak: true, detail: "registered" }]);
    assert.equal(v.ok, true);
    assert.equal(v.notes.length, 1);
  });
  test("a name nothing uses is free", () => assert.equal(verdict("Vorla", [{ source: "npm", found: false }]).ok, true));
  test("a lookup that failed is listed as not checked, not as free proof", () => {
    assert.deepEqual(verdict("Vorla", [{ source: "GitHub", found: null }]).unchecked, ["GitHub"]);
  });
  test("names become package slugs", () => assert.equal(slugName("Ditch App!"), "ditch-app"));
});
