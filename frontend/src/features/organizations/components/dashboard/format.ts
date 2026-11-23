/** 2026-11-18T10:42:00Z → { date: «18.11.2026», time: «12:42» } */
export const formatDateTime = (iso: string) => {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
  }
}
