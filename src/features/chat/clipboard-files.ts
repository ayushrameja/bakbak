interface ClipboardFileSource {
  files: ArrayLike<File>;
  items: ArrayLike<Pick<DataTransferItem, "kind" | "type" | "getAsFile">>;
}

export function clipboardFiles(source: ClipboardFileSource): File[] {
  const files: File[] = [];
  const seenFiles = new Set<File>();
  const seenSignatures = new Set<string>();

  const add = (file: File | null) => {
    if (!file || seenFiles.has(file)) return;
    const signature = fileSignature(file);
    if (seenSignatures.has(signature)) return;
    seenFiles.add(file);
    seenSignatures.add(signature);
    files.push(file);
  };

  Array.from(source.items).forEach((item) => {
    if (item.kind === "file") {
      add(withClipboardMimeType(item.getAsFile(), item.type));
    }
  });
  Array.from(source.files).forEach(add);

  return files;
}

function fileSignature(file: File): string {
  return [file.name, file.size, file.lastModified].join("\u0000");
}

function withClipboardMimeType(file: File | null, type: string): File | null {
  if (!file || file.type || !type) return file;
  return new File([file], file.name || "clipboard-image", {
    type: type.toLowerCase(),
    lastModified: file.lastModified,
  });
}
