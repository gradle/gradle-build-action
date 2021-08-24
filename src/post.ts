import * as caches from './caches'

// Invoked by GitHub Actions
export async function run(): Promise<void> {
    await caches.save()
}

run()
