#!/usr/bin/env bun
/**
 * Starts the complete local development environment:
 *
 * 1. Creates missing app-local env files from their examples.
 * 2. Starts PostgreSQL and waits for its health check.
 * 3. Applies pending migrations.
 * 4. Runs the API and web development servers.
 *
 * PostgreSQL stays running after the dev servers stop, which keeps subsequent
 * starts fast. Use `docker compose down` when you want to stop it.
 */

export {}

const ENV_FILES = [
  ['apps/api/.env', 'apps/api/.env.example'],
  ['apps/web/.env', 'apps/web/.env.example'],
] as const

async function ensureEnvFile(destination: string, example: string): Promise<void> {
  if (await Bun.file(destination).exists()) return

  await Bun.write(destination, Bun.file(example))
  console.log(`Created ${destination} from ${example}`)
}

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`)
  }
}

for (const [destination, example] of ENV_FILES) {
  await ensureEnvFile(destination, example)
}

console.log('Starting PostgreSQL...')
await run(['docker', 'compose', 'up', '-d', '--wait', 'postgres'])

console.log('Applying database migrations...')
await run(['bun', 'run', 'db:migrate'])

console.log('Starting API and web servers using their app-local environment settings...')
await run(['bun', 'run', 'dev'])
