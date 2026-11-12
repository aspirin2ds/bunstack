/** Compare against a branch base in CI, and HEAD for uncommitted local edits. */
export function editedMigrations(base = 'HEAD', cwd = '.') {
  const result = Bun.spawnSync(
    [
      'git',
      'diff',
      '--no-renames',
      '--name-only',
      '--diff-filter=M',
      base,
      '--',
      'apps/api/drizzle',
    ],
    { cwd },
  )
  if (result.exitCode !== 0) {
    throw new Error(`Cannot compare migrations against ${base}: ${result.stderr.toString()}`)
  }
  return result.stdout
    .toString()
    .split('\n')
    .filter((path) => path.endsWith('.sql'))
}
