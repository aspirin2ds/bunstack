/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ModeToggle } from '@/components/mode-toggle'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

// `?url` plus the triple-slash directive above is how Start's Vite build wants a
// stylesheet referenced: it emits a hashed URL instead of inlining the CSS.
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'bunstack' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: () => (
    <EmptyState title="Page not found" description="That route does not exist in this app." />
  ),
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

/**
 * Renders whatever the API reported. `ApiError` messages come from the API's error
 * envelope, which is safe to display: the API replaces unexpected error messages
 * with "Internal server error" in production (RULES.md ERR-04), so this cannot
 * leak a stack trace or a connection string.
 */
function RootErrorComponent({ error }: { error: Error }) {
  return (
    <RootDocument>
      <EmptyState
        title="Something went wrong"
        description={import.meta.env.PROD ? 'Please try again later.' : error.message}
      />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  /**
   * Dims the page while a loader is in flight, so navigation does not look frozen.
   *
   * `isLoading`, not `status === 'pending'`: the router's status is `pending`
   * during server rendering too, so that version shipped every SSR response
   * pre-dimmed and it stayed that way until hydration.
   */
  const isPending = useRouterState({ select: (state) => state.isLoading })

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-svh antialiased">
        <ThemeProvider defaultTheme="system" storageKey="bunstack-theme">
          <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-8 px-6 py-10">
            <header className="flex items-center justify-between gap-4">
              <Link to="/users" className="font-heading text-lg font-semibold tracking-tight">
                bunstack
              </Link>
              <nav className="text-muted-foreground flex items-center gap-3 text-sm">
                <Link to="/users" className="hover:text-foreground transition-colors">
                  Users
                </Link>
                <ModeToggle />
              </nav>
            </header>

            <main
              className={`flex-1 transition-opacity ${isPending ? 'opacity-60' : 'opacity-100'}`}
            >
              {children}
            </main>
          </div>

          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

export function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  )
}
