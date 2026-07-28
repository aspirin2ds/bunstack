import { ApiError, unwrap, unwrapEmpty } from '@repo/api-client'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api.server'
import { EmptyState } from './__root.tsx'

/**
 * Server functions, not direct `fetch` from the browser: `api.server.ts` may only
 * be imported on the server (RULES.md WS-05), and this keeps `API_URL` — an
 * internal hostname in compose — out of the client bundle entirely.
 *
 * The bodies are thin on purpose. Validation, uniqueness and the error envelope
 * all live in the API; duplicating any of it here would mean two implementations
 * to keep in step (RULES.md ARCH-02, applied across services).
 */
const listUsers = createServerFn().handler(async () => {
  return await unwrap(await api.api.users.$get({ query: {} }))
})

/**
 * The schema mirrors the API's `CreateUser` bounds so the form can report a
 * problem without a round trip. The API re-validates regardless — a server
 * function is reachable by anything that can reach the web app.
 */
const CreateUserInput = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(200),
})

const createUser = createServerFn({ method: 'POST' })
  .validator(CreateUserInput)
  .handler(async ({ data }) => {
    return await unwrap(await api.api.users.$post({ json: data }))
  })

const deleteUser = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await unwrapEmpty(await api.api.users[':id'].$delete({ param: { id: data.id } }))
  })

export const Route = createFileRoute('/users')({
  loader: () => listUsers(),
  component: UsersPage,
})

function UsersPage() {
  const users = Route.useLoaderData()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Served by the API at build-independent runtime, through the typed client.
          </p>
        </div>
        <CreateUserDialog onCreated={() => router.invalidate()} />
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users yet" description="Create the first one to see it here." />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DeleteUserButton
                      id={user.id}
                      name={user.name}
                      onDeleted={() => router.invalidate()}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CreateUserDialog({ onCreated }: Readonly<{ onCreated: () => void }>) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const parsed = CreateUserInput.safeParse({
      email: form.get('email'),
      name: form.get('name'),
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form and try again')
      return
    }

    setPending(true)

    try {
      const user = await createUser({ data: parsed.data })
      toast.success(`Created ${user.name}`)
      setOpen(false)
      onCreated()
    } catch (error) {
      toast.error(describe(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New user</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>
              Email must be unique — a duplicate comes back as a 409, not a 500.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Ada Lovelace" required maxLength={200} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="ada@example.com"
                required
                maxLength={254}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteUserButton({
  id,
  name,
  onDeleted,
}: Readonly<{ id: string; name: string; onDeleted: () => void }>) {
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)

    try {
      await deleteUser({ data: { id } })
      toast.success(`Deleted ${name}`)
      onDeleted()
    } catch (error) {
      toast.error(describe(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={pending}
      aria-label={`Delete ${name}`}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  )
}

/**
 * Server functions serialize a thrown error, so the `ApiError` class does not
 * survive the boundary — only its message does. Both branches are here because
 * the same helper runs on either side during SSR.
 */
function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Request failed'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
