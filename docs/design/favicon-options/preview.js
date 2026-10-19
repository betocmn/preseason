const favicon = document.querySelector('#concept-favicon')
const status = document.querySelector('#preview-status')
const buttons = document.querySelectorAll('button[data-icon]')

for (const button of buttons) {
  button.addEventListener('click', () => {
    const icon = button.getAttribute('data-icon')
    const name = button.getAttribute('data-name')
    if (!favicon || !status || !icon || !name) return

    favicon.setAttribute('href', `./${icon}`)
    document.title = `${name} — Preseason favicon`
    status.textContent = `${name} is in this browser tab. Tell me your choice in our conversation.`

    for (const other of buttons) {
      const active = other === button
      other.setAttribute('aria-pressed', String(active))
      other.replaceChildren(active ? 'Previewing in this tab ' : 'Try in this tab ')
      const arrow = document.createElement('span')
      arrow.setAttribute('aria-hidden', 'true')
      arrow.textContent = '↗'
      other.append(arrow)
    }
  })
}
