#!/usr/bin/env bun
/** Exercise --bare in a disposable copy, including its generated routes and migrations. */
const root = (await Bun.$`pwd`.text()).trim()
const fixture = `/tmp/bunstack-scaffold-${crypto.randomUUID()}`

async function run(command: string[]) {
  const child = Bun.spawn(command, { cwd: fixture, stdout: 'inherit', stderr: 'inherit' })
  if ((await child.exited) !== 0) throw new Error(`Scaffold check failed: ${command.join(' ')}`)
}

try {
  const paths = (await Bun.$`git ls-files -z --cached --others --exclude-standard`.text())
    .split('\0')
    .filter(Boolean)
  for (const path of paths) {
    await Bun.write(`${fixture}/${path}`, Bun.file(`${root}/${path}`))
  }
  // Preserve the isolated linker's relative symlinks without fetching dependencies.
  await Bun.$`cp -R ${root}/node_modules ${fixture}/node_modules`.quiet()
  for (const workspace of ['apps/api', 'apps/web', 'packages/api-client']) {
    await Bun.$`cp -R ${root}/${workspace}/node_modules ${fixture}/${workspace}/node_modules`.quiet()
  }
  await run(['git', 'init', '-q'])
  await run(['git', 'add', '.'])
  await run([
    'git',
    '-c',
    'user.name=Scaffold Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'Fixture',
  ])
  await run(['bun', 'scripts/init.ts', 'scaffold-test', '--bare'])
  await run(['bun', 'run', 'db:generate'])
  await run(['bun', 'run', 'check'])
  await run(['bun', 'run', 'build'])
} finally {
  await Bun.$`rm -rf ${fixture}`.quiet()
}
