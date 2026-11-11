export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return
  const columns = Object.keys(rows[0])
  const escapeValue = (value: string | number) => {
    const text = String(value)
    const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safeText.replace(/"/g, '""')}"`
  }
  const csv = [
    columns.map(escapeValue).join(','),
    ...rows.map((row) => columns.map((column) => escapeValue(row[column] ?? '')).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
