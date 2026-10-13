import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // The tariff rules are absolute instants, so the suite pins the process
    // zone to prove it never depends on the machine's local time.
    env: { TZ: 'Pacific/Kiritimati' },
  },
})
