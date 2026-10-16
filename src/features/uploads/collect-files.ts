import { folderPathOf } from "@/features/folders/schema";

// Files picked or dropped, with the folders they sat in relative to what was
// picked ("Shots/Day 1/clip.mp4" -> ["Shots", "Day 1"]).
export type PickedFile = { file: File; folderPath: string[] };

// Stops a dropped folder with thousands of files from being walked to the end;
// the uploader only takes MAX_FILES_PER_BATCH anyway and reports the rest.
const MAX_ENTRIES = 1000;

// Hidden files (.DS_Store, ._clip.mp4) come along with dropped folders; nobody means to upload them.
const isHidden = (name: string) => name.startsWith(".");

// <input type="file" webkitdirectory> gives each file a webkitRelativePath.
export function filesFromInput(files: FileList): PickedFile[] {
  return [...files]
    .filter((file) => !isHidden(file.name))
    .map((file) => ({ file, folderPath: folderPathOf(file.webkitRelativePath || file.name) }));
}

// A drop can mix files and folders. Folders are only reachable through the
// (non-standard but universally supported) FileSystem Entry API.
export async function filesFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  // Entries must be taken synchronously: the item list is emptied once the
  // drop handler yields.
  const entries = [...transfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return [...transfer.files].map((file) => ({ file, folderPath: [] }));

  const picked: PickedFile[] = [];
  const queue = [...entries];
  while (queue.length > 0 && picked.length < MAX_ENTRIES) {
    const entry = queue.shift()!;
    if (isHidden(entry.name)) continue;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      picked.push({ file, folderPath: folderPathOf(entry.fullPath) });
    } else if (entry.isDirectory) {
      queue.push(...(await readAll(entry as FileSystemDirectoryEntry)));
    }
  }
  return picked;
}

// readEntries() returns at most ~100 entries per call; call until it's empty.
async function readAll(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}
