import { describe, expect, it } from "vitest";
import { clipboardFiles } from "./clipboard-files";

function clipboard(
  files: File[],
  items: Array<{ kind: string; type?: string; getAsFile: () => File | null }>,
) {
  return {
    files,
    items: items.map((item) => ({ type: "", ...item })),
  };
}

describe("Windows-compatible clipboard files", () => {
  it.each([
    ["PNG", "image/png"],
    ["JPEG", "image/jpeg"],
    ["WebP", "image/webp"],
  ])("reads a %s exposed only through clipboard items", (_label, type) => {
    const image = new File(["image"], `clipboard.${type.split("/")[1]}`, {
      type,
      lastModified: 42,
    });

    expect(
      clipboardFiles(
        clipboard(
          [],
          [
            { kind: "file", getAsFile: () => image },
            { kind: "string", getAsFile: () => null },
          ],
        ),
      ),
    ).toEqual([image]);
  });

  it("keeps an image when text accompanies it and ignores unsupported text items", () => {
    const image = new File(["png"], "Screenshot.png", {
      type: "image/png",
      lastModified: 42,
    });

    expect(
      clipboardFiles(
        clipboard(
          [],
          [
            { kind: "string", getAsFile: () => null },
            { kind: "file", getAsFile: () => image },
          ],
        ),
      ),
    ).toEqual([image]);
  });

  it("deduplicates the file/item representations Windows exposes for one image", () => {
    const fileRepresentation = new File(["png"], "Screenshot.png", {
      type: "image/png",
      lastModified: 42,
    });
    const itemRepresentation = new File(["png"], "Screenshot.png", {
      type: "image/png",
      lastModified: 42,
    });

    expect(
      clipboardFiles(
        clipboard(
          [fileRepresentation],
          [{ kind: "file", getAsFile: () => itemRepresentation }],
        ),
      ),
    ).toEqual([itemRepresentation]);
  });

  it("restores an item MIME type omitted from the Windows File representation", () => {
    const untyped = new File(["png"], "Screenshot.png", {
      type: "",
      lastModified: 42,
    });

    const [normalized] = clipboardFiles(
      clipboard(
        [untyped],
        [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => untyped,
          },
        ],
      ),
    );

    expect(normalized).toMatchObject({
      name: "Screenshot.png",
      type: "image/png",
      size: untyped.size,
      lastModified: 42,
    });
  });

  it("keeps unsupported file items so the existing type limits can explain the rejection", () => {
    const svg = new File(["<svg/>"], "clipboard.svg", {
      type: "image/svg+xml",
    });

    expect(
      clipboardFiles(clipboard([], [{ kind: "file", getAsFile: () => svg }])),
    ).toEqual([svg]);
  });
});
