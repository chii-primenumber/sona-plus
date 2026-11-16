/** Lightweight static glyphs for native-client entries; no React root per button. */
export function styleClientEntry(button: HTMLElement, label: string, kind: 'history' | 'team' | 'build') {
  button.classList.add('sona-client-icon-button')
  button.setAttribute('aria-label', label)
  button.title = label
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7')
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute('d', kind === 'history' ? 'M4 20V11h3v9m3 0V5h3v15m3 0V9h3v11M2 22h20' : kind === 'team' ? 'M3 21v-5a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v5M19 21v-4a4 4 0 0 0-3-4M12 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm7 1a3 3 0 0 1-4 3' : 'm5 3 16 16-2 2L3 5zm-1 18 6-6m4-6 5-6 2 2-6 5M2 18l4 4m12-20 4 4')
  svg.appendChild(path); button.replaceChildren(svg)
}
