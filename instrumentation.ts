export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Resolving the region at boot makes an invalid REGION fail the app at startup.
  // Next.js only logs an error thrown from register() and keeps the server up, so
  // the process must exit explicitly for the deployment to actually fail (D2).
  try {
    const { regionActiva } = await import('./lib/infraestructura/region/activa')
    regionActiva()
  } catch (error) {
    console.error(`Invalid region configuration, aborting boot: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
    throw error
  }
}
