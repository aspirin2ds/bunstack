import { afterEach, beforeEach, expect, it } from 'bun:test'
import { editedMigrations } from './migrations.ts'

let directory: string

function git(...args: string[]) {
  const result = Bun.spawnSync(
    ['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    {
      cwd: directory,
    },
  )
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

beforeEach(async () => {
  directory = `/tmp/bunstack-migrations-${crypto.randomUUID()}`
  await Bun.$`mkdir -p ${directory}/apps/api/drizzle`.quiet()
  git('init', '-q')
  await Bun.write(`${directory}/apps/api/drizzle/0000_initial.sql`, 'select 1;\n')
  git('add', '.')
  git('commit', '-qm', 'Initial migration')
})

afterEach(async () => {
  await Bun.$`rm -rf ${directory}`.quiet()
})

it('detects edits after they have been committed on a clean branch', async () => {
  const base = git('rev-parse', 'HEAD')
  await Bun.write(`${directory}/apps/api/drizzle/0000_initial.sql`, 'select 2;\n')
  expect(editedMigrations('HEAD', directory)).toEqual(['apps/api/drizzle/0000_initial.sql'])
  git('add', '.')
  git('commit', '-qm', 'Edit applied migration')
  expect(git('status', '--porcelain')).toBe('')
  expect(editedMigrations(base, directory)).toEqual(['apps/api/drizzle/0000_initial.sql'])
})

it('allows new migrations and the bare scaffold reset', async () => {
  const base = git('rev-parse', 'HEAD')
  await Bun.write(`${directory}/apps/api/drizzle/0001_next.sql`, 'select 2;\n')
  git('add', '.')
  git('commit', '-qm', 'New migration')
  expect(editedMigrations(base, directory)).toEqual([])
  await Bun.file(`${directory}/apps/api/drizzle/0000_initial.sql`).delete()
  expect(editedMigrations(base, directory)).toEqual([])
})

it('fails closed when the comparison revision is unavailable', () => {
  expect(() => editedMigrations('missing-base', directory)).toThrow('Cannot compare migrations')
})
