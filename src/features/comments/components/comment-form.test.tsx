import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLORS } from "@/features/annotations/schema";
import { PlayerProvider, usePlayer } from "@/features/player/player-context";
import { CommentForm } from "./comment-form";

// jsdom has no media playback and no layout. The test plays the part of the
// browser: a paused <video> whose time we set, with a 1280×720 picture shown
// in a 640×360 box (so no letterbox and 1 px = 1/640 of the width).

let videoTime = 0;
let video: HTMLVideoElement | null = null;

function seek(seconds: number) {
  videoTime = seconds;
  video?.dispatchEvent(new Event("seeked"));
}

function FakeVideo() {
  const { videoRef, setOverlayHost } = usePlayer();
  return (
    <>
      <video
        ref={(element) => {
          videoRef.current = element;
          video = element;
          if (!element) return;
          Object.defineProperties(element, {
            currentTime: { get: () => videoTime, set: (value: number) => seek(value), configurable: true },
            paused: { get: () => true, configurable: true },
            videoWidth: { value: 1280, configurable: true },
            videoHeight: { value: 720, configurable: true },
            pause: { value: () => {}, configurable: true },
          });
        }}
      />
      <div ref={setOverlayHost} />
    </>
  );
}

function renderForm() {
  const onSubmit = vi.fn().mockResolvedValue(null);
  render(
    <PlayerProvider fps={25} durationMs={10_000}>
      <FakeVideo />
      <CommentForm members={[]} submitLabel="Comment" withTimecode onSubmit={onSubmit} />
    </PlayerProvider>,
  );
  return { user: userEvent.setup(), onSubmit };
}

beforeEach(() => {
  videoTime = 2; // frame 50 at 25 fps
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 360 }));
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function drawArrow(from: [number, number], to: [number, number]) {
  const area = screen.getByRole("img", { name: /drawing area/i });
  fireEvent.pointerDown(area, { pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(area, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(area, { pointerId: 1, clientX: to[0], clientY: to[1] });
}

describe("CommentForm on a video", () => {
  it("sends the text, the pinned frame, a range and an arrow as one value", async () => {
    const { user, onSubmit } = renderForm();

    // Starting to type pins the frame on screen.
    await user.click(screen.getByRole("combobox", { name: "Comment" }));
    expect(screen.getByText("@ 00:00:02:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Draw on frame" }));
    drawArrow([64, 36], [320, 180]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Edit drawing (1)" })).toBeInTheDocument();

    seek(3); // frame 75
    await user.click(screen.getByRole("button", { name: "Set range end" }));
    expect(screen.getByText("@ 00:00:02:00 – 00:00:03:00")).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Comment" }), "Logo is cut off here");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    expect(onSubmit).toHaveBeenCalledWith({
      body: "Logo is cut off here",
      mentions: [],
      // Frame middles: (50 + 0.5) / 25 s and (75 + 0.5) / 25 s.
      timecodeMs: 2020,
      rangeEndMs: 3020,
      // Normalized to the picture: 64/640 = 0.1, 320/640 = 0.5.
      annotation: [{ kind: "arrow", from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, color: COLORS[0] }],
    });
    // Cleared for the next comment.
    expect(screen.getByRole("combobox", { name: "Comment" })).toHaveValue("");
  });

  it("won't send a range that ends before it starts", async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole("combobox", { name: "Comment" }));
    seek(1);
    await user.click(screen.getByRole("button", { name: "Set range end" }));
    expect(await screen.findByText("The range must end after it starts.")).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Comment" }), "Too early");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("drops the drawing and the range with the timecode", async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole("combobox", { name: "Comment" }));
    await user.click(screen.getByRole("button", { name: "Draw on frame" }));
    drawArrow([10, 10], [200, 100]);
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "No timecode" }));
    await user.type(screen.getByRole("combobox", { name: "Comment" }), "General note");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ timecodeMs: null, rangeEndMs: null, annotation: null }),
    );
  });
});
