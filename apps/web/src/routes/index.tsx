import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The template has one resource, so `/` just forwards to it. Redirecting in
 * `beforeLoad` happens before any rendering, on the server during SSR — the
 * browser never receives an intermediate page.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/users', search: { page: 1 } })
  },
})
