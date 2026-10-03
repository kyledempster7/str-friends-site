// MP3 is the only supported audio format. Other output, including transcripts
// and files placed in an audio directory, still uses the static-site budget.
export function outputBudgetFindings(files) {
  let staticBytes = 0, audioBytes = 0;
  for (const { name, size } of files) {
    if (/\.mp3$/i.test(name)) audioBytes += size;
    else staticBytes += size;
  }
  const findings = [];
  if (staticBytes > 2 * 1024 * 1024) findings.push('Non-audio static output exceeds the two-megabyte budget');
  if (audioBytes > 300_000_000) findings.push('Total audio output exceeds 300 MB');
  return findings;
}
