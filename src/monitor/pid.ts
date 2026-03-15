import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const PID_FILE_PATH = join(tmpdir(), 'echo-monitor.pid');

export function writePid(pid: number): void {
  writeFileSync(PID_FILE_PATH, String(pid), 'utf8');
}

export function readPid(): number | null {
  if (!existsSync(PID_FILE_PATH)) return null;
  const raw = readFileSync(PID_FILE_PATH, 'utf8').trim();
  const pid = parseInt(raw, 10);
  return isNaN(pid) ? null : pid;
}

export function clearPid(): void {
  if (existsSync(PID_FILE_PATH)) unlinkSync(PID_FILE_PATH);
}
