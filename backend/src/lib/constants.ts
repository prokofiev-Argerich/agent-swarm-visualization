export const SESSION_KEY = "swarm-ide.session.v1";

export const ALLOWED_FILE_EXTENSIONS = new Set(["md", "txt", "json", "csv"]);
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_FILE_CONTENT_CHARS = 100_000;
export const MAX_FILES_IN_CONTEXT = 20;
