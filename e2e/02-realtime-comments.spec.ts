import { expect, test } from "@playwright/test";
import { DEMO_PROJECT, personPage, unique, uploadAndProcess, waitForVideo } from "./helpers";

// 2. A comment with a timecode and an arrow; a second user sees it live and replies.
test("a timecoded comment with an arrow reaches another reviewer live, who replies", async ({ browser }) => {
  const editor = await personPage(browser, "editor@example.com");
  const assetUrl = await uploadAndProcess(editor, DEMO_PROJECT, unique("comment-clip"));
  const reviewer = await personPage(browser, "reviewer@example.com");
  await reviewer.goto(assetUrl);
  await waitForVideo(reviewer);
  await waitForVideo(editor);

  // Editor: pause on 2 s, pin the frame, draw an arrow, write, send.
  await editor.locator("video").evaluate((v: HTMLVideoElement) => {
    v.pause();
    v.currentTime = 2.02;
  });
  const text = unique("Logo too close to the edge");
  await editor.getByRole("combobox", { name: "Comment" }).click();
  await editor.getByRole("button", { name: "Draw on frame" }).click();
  const area = editor.getByRole("img", { name: /drawing area/i });
  const box = (await area.boundingBox())!;
  await editor.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await editor.mouse.down();
  await editor.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 5 });
  await editor.mouse.up();
  await editor.getByRole("button", { name: "Done" }).click();
  await editor.getByRole("combobox", { name: "Comment" }).fill(text);
  await editor.getByRole("button", { name: "Comment", exact: true }).click();

  // Reviewer: the thread appears without a reload, with its frame and drawing.
  const thread = reviewer.locator("li", { has: reviewer.getByText(text) }).first();
  await expect(thread).toBeVisible();
  await expect(thread.getByRole("button", { name: /Go to 00:00:02:00/ })).toBeVisible();
  await expect(thread.getByText("✎ drawing")).toBeVisible();

  // Clicking the timecode jumps there and shows the arrow over the frame.
  await thread.getByRole("button", { name: /Go to 00:00:02:00/ }).click();
  await expect(reviewer.getByRole("img", { name: "Drawing with 1 shape(s)" })).toBeVisible();

  const reply = unique("Moved it");
  await thread.getByRole("button", { name: "Reply" }).click();
  await thread.getByRole("combobox", { name: "Comment" }).fill(reply);
  await thread.getByRole("button", { name: "Reply" }).click();

  // And the editor gets the reply live.
  await expect(editor.locator("li", { has: editor.getByText(text) }).first().getByText(reply)).toBeVisible();
});
