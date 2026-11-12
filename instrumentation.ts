export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Resolving the region at boot makes an invalid REGION fail the app at startup.
  const { regionActiva } = await import('./lib/infraestructura/region/activa')
  regionActiva()
}
