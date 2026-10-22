const STORAGE_KEY = 'duvidas.app.v1'
const categoryLabels = {
  estudos: 'Estudos',
  trabalho: 'Trabalho',
  tecnologia: 'Tecnologia',
  vida: 'Vida'
}

const state = {
  category: 'todas',
  query: '',
  doubts: loadDoubts()
}

const searchForm = document.querySelector('#search-form')
const searchInput = document.querySelector('#search-input')
const chips = [...document.querySelectorAll('.chip')]
const cards = [...document.querySelectorAll('.faq-card')]
const resultCount = document.querySelector('#result-count')
const emptyState = document.querySelector('#empty-state')
const doubtForm = document.querySelector('#doubt-form')
const doubtInput = document.querySelector('#doubt-input')
const doubtCategory = document.querySelector('#doubt-category')
const doubtList = document.querySelector('#doubt-list')
const doubtEmpty = document.querySelector('#doubt-empty')
const doubtCount = document.querySelector('#doubt-count')
const toast = document.querySelector('#toast')

function loadDoubts() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter(item => item && typeof item.text === 'string').map(item => ({
      id: String(item.id || crypto.randomUUID()),
      text: item.text.slice(0, 280),
      category: categoryLabels[String(item.category || '').toLowerCase()] || 'Estudos',
      done: Boolean(item.done),
      createdAt: Number(item.createdAt) || Date.now()
    }))
  } catch {
    return []
  }
}

function saveDoubts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doubts))
  } catch {
    showToast('Não foi possível salvar neste navegador.')
  }
}

function showToast(message) {
  if (!toast) return
  toast.textContent = message
  toast.classList.add('is-visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600)
}

function applyFilters() {
  const query = state.query.trim().toLowerCase()
  let visible = 0

  for (const card of cards) {
    const category = card.dataset.category || ''
    const haystack = `${card.textContent} ${card.dataset.search || ''}`.toLowerCase()
    const matchesCategory = state.category === 'todas' || category === state.category
    const matchesQuery = !query || haystack.includes(query)
    const show = matchesCategory && matchesQuery
    card.classList.toggle('is-hidden', !show)
    if (show) visible += 1
  }

  resultCount.textContent = `${visible} ${visible === 1 ? 'pergunta' : 'perguntas'}`
  emptyState.hidden = visible !== 0
}

function setCategory(category) {
  state.category = category
  for (const chip of chips) {
    const active = chip.dataset.category === category
    chip.classList.toggle('is-active', active)
    chip.setAttribute('aria-pressed', String(active))
  }
  applyFilters()
}

function relativeTime(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} d`
}

function renderDoubts() {
  doubtList.replaceChildren()
  doubtCount.textContent = String(state.doubts.length)
  doubtEmpty.hidden = state.doubts.length > 0

  for (const doubt of state.doubts) {
    const item = document.createElement('li')
    item.className = `doubt-item${doubt.done ? ' is-done' : ''}`
    item.dataset.id = doubt.id

    const check = document.createElement('button')
    check.type = 'button'
    check.className = 'doubt-check'
    check.dataset.action = 'toggle'
    check.setAttribute('aria-label', doubt.done ? 'Marcar como não resolvida' : 'Marcar como resolvida')
    check.setAttribute('aria-pressed', String(doubt.done))

    const body = document.createElement('div')
    body.className = 'doubt-body'

    const text = document.createElement('p')
    text.className = 'doubt-text'
    text.textContent = doubt.text

    const meta = document.createElement('div')
    meta.className = 'doubt-meta'

    const tag = document.createElement('span')
    tag.className = 'doubt-tag'
    tag.textContent = doubt.category

    const time = document.createElement('span')
    time.textContent = relativeTime(doubt.createdAt)

    meta.append(tag, time)
    body.append(text, meta)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'doubt-remove'
    remove.dataset.action = 'remove'
    remove.setAttribute('aria-label', `Remover dúvida: ${doubt.text.slice(0, 60)}`)
    remove.textContent = '×'

    item.append(check, body, remove)
    doubtList.append(item)
  }
}

function addDoubt(text, category) {
  state.doubts.unshift({
    id: crypto.randomUUID(),
    text,
    category,
    done: false,
    createdAt: Date.now()
  })
  saveDoubts()
  renderDoubts()
  doubtInput.value = ''
  showToast('Dúvida adicionada ao seu caderno.')
}

searchForm.addEventListener('submit', event => {
  event.preventDefault()
  state.query = searchInput.value
  applyFilters()
  document.querySelector('#perguntas').scrollIntoView({ behavior: 'smooth', block: 'start' })
})

searchInput.addEventListener('input', () => {
  state.query = searchInput.value
  applyFilters()
})

for (const chip of chips) {
  chip.addEventListener('click', () => setCategory(chip.dataset.category))
}

for (const button of document.querySelectorAll('.faq-more')) {
  button.addEventListener('click', () => {
    const extra = button.closest('.faq-card').querySelector('.faq-extra')
    const expanded = button.getAttribute('aria-expanded') === 'true'
    button.setAttribute('aria-expanded', String(!expanded))
    extra.hidden = expanded
    button.firstChild.textContent = expanded ? 'Ver resposta completa ' : 'Ver menos '
  })
}

doubtForm.addEventListener('submit', event => {
  event.preventDefault()
  const text = doubtInput.value.trim()
  if (!text) {
    doubtInput.focus()
    return
  }
  addDoubt(text, doubtCategory.value)
})

doubtList.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  const item = button.closest('.doubt-item')
  const doubt = state.doubts.find(entry => entry.id === item?.dataset.id)
  if (!doubt) return

  if (button.dataset.action === 'toggle') {
    doubt.done = !doubt.done
    saveDoubts()
    renderDoubts()
  }

  if (button.dataset.action === 'remove') {
    state.doubts = state.doubts.filter(entry => entry.id !== doubt.id)
    saveDoubts()
    renderDoubts()
    showToast('Dúvida removida.')
  }
})

for (const link of document.querySelectorAll('.nav-link')) {
  link.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.nav-link')) other.classList.remove('is-active')
    link.classList.add('is-active')
  })
}

applyFilters()
renderDoubts()
document.body.dataset.ready = 'true'
