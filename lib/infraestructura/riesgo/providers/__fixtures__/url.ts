export function longitudesDeUrl(url: string): number[] {
  return (new URL(url).searchParams.get('longitude') ?? '').split(',').map(Number)
}
