export function logEvent(event: { tool?: string; session_id?: string; duration_ms?: number; status: string; error_category?: string }): void {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`);
}
