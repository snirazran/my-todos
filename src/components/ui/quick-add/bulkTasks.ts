export const MAX_BULK_TASKS = 50;
export const MAX_TASK_TEXT_LENGTH = 100;

const LIST_PREFIX = /^\s*(?:(?:[-*•▪◦‣⁃]+|\d{1,3}[.)]|[a-zA-Z][.)])\s+|\[(?:\s|x|X)?\]\s*)/;

export type ParsedBulkTasks = {
  tasks: string[];
  omittedCount: number;
};

export function cleanBulkTaskLine(value: string) {
  return value.replace(LIST_PREFIX, '').trim();
}

export function parseBulkTasks(
  value: string,
  limit = MAX_BULK_TASKS,
): ParsedBulkTasks {
  const cleaned: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const task = cleanBulkTaskLine(line);
    if (task) cleaned.push(task);
  }
  return {
    tasks: cleaned.slice(0, limit),
    omittedCount: Math.max(0, cleaned.length - limit),
  };
}
