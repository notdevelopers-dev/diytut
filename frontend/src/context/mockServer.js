import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

const app = express()
const PORT = 4000

app.use(cors({ origin: 'http://localhost:5174', credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Коли фронтенд питає поточного користувача — завжди віддаємо адміністратора Христину
app.get('/api/auth/me', (req, res) => {
  res.json({
    id: 1,
    name: 'Адміністратор Христина',
    email: 'hrystya@test.com',
    role: 'admin',
  })
})

// Замість редиректу на зовнішній сервіс — просто успішний JSON, щоб не було 502
app.get('/api/auth/google/login', (req, res) => {
  res.json({ success: true, message: 'Авторизація успішна' })
})

app.get('/api/admin/stats/logins', (req, res) => {
  res.json({
    date_from: '2026-10-01',
    date_to: '2026-11-15',
    timezone: 'Europe/Kyiv',
    total_logins: 142,
    unique_users: 38,
    days: [
      { date: '2026-11-14', logins: 12, unique_users: 8 },
      { date: '2026-11-15', logins: 15, unique_users: 10 },
    ],
  })
})

let mockOrganizations = [
  { id: 101, name: 'Студентська рада ФЕІ', status: 'pending' },
  { id: 102, name: 'Клуб програмістів «CodeCraft»', status: 'pending' },
]

app.get('/api/admin/organizations', (req, res) => {
  res.json({
    items: mockOrganizations,
  })
})

app.post('/api/admin/organizations/:id/review', (req, res) => {
  const orgId = Number(req.params.id)
  const { status, comment } = req.body

  mockOrganizations = mockOrganizations.filter((org) => org.id !== orgId)

  res.json({
    success: true,
    message: `Організацію успішно оновлено до статусу: ${status}`,
    comment,
  })
})

app.listen(PORT, () => {
  console.log(`Mock-бекенд успішно запущено на http://localhost:${PORT}`)
})
